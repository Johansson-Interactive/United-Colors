/// <reference types="vite/client" />

/**
 * The dependency rule between the layers under src/, as AGENTS.md and the README state it:
 * domain is pure TypeScript, application orchestrates it, infrastructure implements the ports,
 * and presentation talks to the game through application. Documented rules drift unless
 * something checks them, so this reads every source file's imports.
 */

const LAYERS = ["domain", "application", "infrastructure", "presentation"] as const;
type Layer = (typeof LAYERS)[number];

/** Layers each layer may import from, besides itself */
const MAY_IMPORT: Record<Layer, readonly Layer[]> = {
	domain: [],
	application: ["domain"],
	infrastructure: ["domain", "application"],
	presentation: ["domain", "application"],
};

/** Paths inside an otherwise allowed layer that a layer may not reach into */
const MAY_NOT_REACH: Partial<Record<Layer, readonly string[]>> = {
	// The engine and its entities are the game's internals; the screen drives a GameSession
	presentation: ["domain/engine", "domain/entities"],
};

/** Packages the inner layers must stay clear of (domain: everything) */
const FORBIDDEN_PACKAGES: Record<Layer, readonly RegExp[]> = {
	domain: [/.*/],
	application: [/^react/, /^react-native/, /^expo/, /^@shopify\//],
	infrastructure: [],
	presentation: [],
};

/** Every source file under src/ (tests excluded), keyed by its path relative to src/ */
const SOURCES = Object.fromEntries(
	Object.entries(
		import.meta.glob(["../../**/*.ts", "../../**/*.tsx", "!../../__tests__/**"], {
			query: "?raw",
			import: "default",
			eager: true,
		}) as Record<string, string>,
	).map(([key, source]) => [key.replace(/^\.\.\/\.\.\//, ""), source]),
);

interface Import {
	file: string;
	specifier: string;
}

function importsOf(file: string, source: string): Import[] {
	const specifiers = [...source.matchAll(/(?:from|import)\s*["']([^"']+)["']/g)].map((m) => m[1]);
	return specifiers.map((specifier) => ({ file, specifier }));
}

function layerOf(file: string): Layer {
	const [layer] = file.split("/");
	if (!LAYERS.includes(layer as Layer)) throw new Error(`${file} is outside the layers`);
	return layer as Layer;
}

/** The path of a relative import, relative to src/; null for a package */
function targetOf({ file, specifier }: Import): string | null {
	if (!specifier.startsWith(".")) return null;
	const parts = file.split("/").slice(0, -1);
	for (const step of specifier.split("/")) {
		if (step === "..") parts.pop();
		else if (step !== ".") parts.push(step);
	}
	return parts.join("/");
}

const describeImport = ({ file, specifier }: Import) => `${file} imports "${specifier}"`;

const files = Object.keys(SOURCES);
const imports = files.flatMap((file) => importsOf(file, SOURCES[file]));

describe("layers", () => {
	it("walks the four layers", () => {
		expect(new Set(files.map(layerOf))).toEqual(new Set(LAYERS));
		expect(imports.length).toBeGreaterThan(files.length);
	});

	it("each layer imports only from itself and the layers beneath it", () => {
		const violations = imports.filter((entry) => {
			const target = targetOf(entry);
			if (target === null) return false;
			const from = layerOf(entry.file);
			const to = target.split("/")[0] as Layer;
			return to !== from && !MAY_IMPORT[from].includes(to);
		});
		expect(violations.map(describeImport)).toEqual([]);
	});

	it("no layer reaches into another's internals", () => {
		const violations = imports.filter((entry) => {
			const target = targetOf(entry);
			if (target === null) return false;
			const barred = MAY_NOT_REACH[layerOf(entry.file)] ?? [];
			return barred.some((prefix) => target.startsWith(prefix));
		});
		expect(violations.map(describeImport)).toEqual([]);
	});

	it("the inner layers stay clear of the UI and platform packages", () => {
		const violations = imports.filter((entry) => {
			if (targetOf(entry) !== null) return false;
			return FORBIDDEN_PACKAGES[layerOf(entry.file)].some((p) => p.test(entry.specifier));
		});
		expect(violations.map(describeImport)).toEqual([]);
	});
});
