import { readdirSync, readFileSync } from "node:fs";
import { SRC_ROOT, transformAsMetro } from "./appBabel.mts";

const workletFiles = readdirSync(SRC_ROOT, { recursive: true, encoding: "utf8" })
	.filter((file) => /\.tsx?$/.test(file) && !file.startsWith("__tests__"))
	.filter((file) => readFileSync(SRC_ROOT + file, "utf8").includes('"worklet"'));

/** A worklet as the UI thread runs it: its parameters and the constants it unpacks from its closure */
interface UiWorklet {
	name: string;
	params: string;
	captured: string[];
}

/**
 * A file's worklets that capture constants, from the code Babel makes of them. A parameter list
 * is read up to its first `)`, so a worklet whose defaults call something is not checked
 */
function uiWorkletsOf(file: string): UiWorklet[] {
	const code = transformAsMetro(readFileSync(SRC_ROOT + file, "utf8"), SRC_ROOT + file, {
		platform: "ios",
		isDev: true,
	});
	return [...code.matchAll(/function (\w+)\(([^)]*)\)\{const\{([^}]*)\}=this\.__closure/g)].map(
		([, name, params, captured]) => ({ name, params, captured: captured.split(",") }),
	);
}

/** Babel over every worklet file takes seconds */
const TRANSFORM_ALL_MS = 30_000;

describe("worklet closures", () => {
	const worklets = new Map<string, UiWorklet[]>();
	beforeAll(() => {
		for (const file of workletFiles) worklets.set(file, uiWorkletsOf(file));
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
});
