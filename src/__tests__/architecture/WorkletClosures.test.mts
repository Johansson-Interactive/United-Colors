import { readdirSync, readFileSync } from "node:fs";
import { type BabelNode, parseOutput, SRC_ROOT, transformAsMetro } from "./appBabel.mts";

const workletFiles = readdirSync(SRC_ROOT, { recursive: true, encoding: "utf8" })
	.filter((file) => /\.tsx?$/.test(file) && !file.startsWith("__tests__"))
	.filter((file) => readFileSync(SRC_ROOT + file, "utf8").includes('"worklet"'));

/** A worklet as the UI thread runs it: its parameters and the constants it unpacks from its closure */
interface UiWorklet {
	name: string;
	params: string;
	captured: string[];
	/** Where in the file's Babel output the worklet is made, and so its closure snapshotted */
	at: number;
	/** Where the file's Babel output makes each named worklet function */
	madeAt: Map<string, number>;
}

/** Where a file's Babel output makes each worklet function, exported or not, in order */
function workletsMade(code: string): [string, number][] {
	return [...code.matchAll(/\bvar (\w+)=(?:exports\.\1=)?function \1_\w+Factory\(/g)].map(
		({ 1: name, index }) => [name, index],
	);
}

/**
 * A file's worklets that capture constants, from the code Babel makes of them. A parameter list
 * is read up to its first `)`, so a worklet whose defaults call something is not checked
 */
function uiWorkletsOf(code: string): UiWorklet[] {
	const madeAt = new Map<string, number>();
	for (const [name, index] of workletsMade(code)) {
		if (!madeAt.has(name)) madeAt.set(name, index);
	}
	return [...code.matchAll(/function (\w+)\(([^)]*)\)\{const\{([^}]*)\}=this\.__closure/g)].map(
		({ 1: name, 2: params, 3: captured, index }) => ({
			name,
			params,
			captured: captured.split(","),
			at: index,
			madeAt,
		}),
	);
}

/** A file's code as Babel makes it for the app */
function babelOutputOf(file: string): string {
	return transformAsMetro(readFileSync(SRC_ROOT + file, "utf8"), SRC_ROOT + file, {
		platform: "ios",
		isDev: true,
	});
}

const FUNCTIONS = new Set([
	"FunctionDeclaration",
	"FunctionExpression",
	"ArrowFunctionExpression",
	"ObjectMethod",
	"ClassMethod",
]);

/** The names `node` reads as it is evaluated, not counting those read inside functions it makes */
function namesReadNow(node: unknown, names: Set<string> = new Set()): Set<string> {
	if (Array.isArray(node)) {
		for (const child of node) namesReadNow(child, names);
		return names;
	}
	if (!node || typeof node !== "object" || !("type" in node)) return names;
	const { type } = node as BabelNode;
	if (FUNCTIONS.has(type)) return names;
	if (type === "Identifier") {
		names.add((node as BabelNode & { name: string }).name);
		return names;
	}
	for (const [key, child] of Object.entries(node)) {
		const computed = (node as BabelNode).computed === true;
		// A property's name and a member's non-computed property are not reads
		if (key === "key" && (type === "ObjectProperty" || type === "ClassProperty") && !computed)
			continue;
		if (key === "property" && type === "MemberExpression" && !computed) continue;
		if (key === "loc" || key === "leadingComments" || key === "trailingComments") continue;
		namesReadNow(child, names);
	}
	return names;
}

/**
 * The worklet functions a file's top-level statements read before Babel has made them, as
 * "statement reads worklet"
 */
function topLevelReadsBeforeMade(code: string): string[] {
	const body = (parseOutput(code).program as BabelNode & { body: BabelNode[] }).body;
	const madeIn = new Map<string, number>();
	for (const [name, at] of workletsMade(code)) {
		const index = body.findIndex(
			(statement) => (statement.start as number) <= at && at < (statement.end as number),
		);
		if (!madeIn.has(name)) madeIn.set(name, index);
	}
	return body.flatMap((statement, index) =>
		[...namesReadNow(statement)]
			.filter((name) => (madeIn.get(name) ?? -1) > index)
			.map(
				(name) =>
					`${code.slice(statement.start as number, statement.end as number).slice(0, 40)}… reads ${name}`,
			),
	);
}

/** Babel over every worklet file takes seconds */
const TRANSFORM_ALL_MS = 30_000;

describe("worklet closures", () => {
	const outputs = new Map<string, string>();
	const worklets = new Map<string, UiWorklet[]>();
	beforeAll(() => {
		for (const file of workletFiles) {
			const code = babelOutputOf(file);
			outputs.set(file, code);
			worklets.set(file, uiWorkletsOf(code));
		}
	}, TRANSFORM_ALL_MS);

	it("finds worklets that capture constants", () => {
		expect([...worklets.values()].flat().length).toBeGreaterThan(0);
	});

	// The UI thread unpacks captured constants at the top of the body, after default parameters
	// have run, so a default that reads one throws "Property doesn't exist"
	it.each(workletFiles)("%s: no default parameter reads a captured constant", (file) => {
		const offending = (worklets.get(file) ?? []).flatMap(({ name, params, captured }) =>
			captured
				.filter((constant) => new RegExp(`=[^,]*\\b${constant}\\b`).test(params))
				.map((constant) => `${name} defaults a parameter to ${constant}`),
		);
		expect(offending).toEqual([]);
	});

	// Babel makes a worklet function a `var` set where it stands, no longer hoisted, and a worklet
	// snapshots its closure when made, so one that calls a worklet declared below it gets
	// undefined on the UI thread: "undefined is not a function"
	it.each(workletFiles)("%s: no worklet captures a worklet declared below it", (file) => {
		const offending = (worklets.get(file) ?? []).flatMap(({ name, captured, at, madeAt }) =>
			captured
				.filter((constant) => (madeAt.get(constant) ?? 0) > at)
				.map((constant) => `${name} captures ${constant} before it is made`),
		);
		expect(offending).toEqual([]);
	});

	// The same holds outside worklets: a top-level value built from worklet functions (a table of
	// reducers, say) above their declarations holds undefined in their place
	it.each(workletFiles)("%s: no top-level statement reads a worklet declared below it", (file) => {
		expect(topLevelReadsBeforeMade(outputs.get(file) ?? "")).toEqual([]);
	});
});
