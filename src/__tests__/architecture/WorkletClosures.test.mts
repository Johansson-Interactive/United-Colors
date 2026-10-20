import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const projectRoot = new URL("../../../", import.meta.url);
const require = createRequire(new URL("package.json", projectRoot));
const babel = require(
	require.resolve("@babel/core", { paths: [require.resolve("expo/package.json")] }),
) as {
	transformSync(source: string, options: Record<string, unknown>): { code: string };
};

const srcRoot = fileURLToPath(new URL("src/", projectRoot));
const workletFiles = readdirSync(srcRoot, { recursive: true, encoding: "utf8" })
	.filter((file) => /\.tsx?$/.test(file) && !file.startsWith("__tests__"))
	.filter((file) => readFileSync(srcRoot + file, "utf8").includes('"worklet"'));

/** UI-thread code of each worklet: its parameters and the constants it unpacks from its closure */
const uiWorklets = (file: string) => {
	let worklets = transformed.get(file);
	if (!worklets) {
		worklets = transformWorklets(file);
		transformed.set(file, worklets);
	}
	return worklets;
};
const transformed = new Map<string, ReturnType<typeof transformWorklets>>();

/** Babel over every file takes seconds */
const TRANSFORM_ALL_MS = 30_000;

function transformWorklets(file: string) {
	const { code } = babel.transformSync(readFileSync(srcRoot + file, "utf8"), {
		cwd: fileURLToPath(projectRoot),
		filename: srcRoot + file,
		configFile: fileURLToPath(new URL("babel.config.js", projectRoot)),
		babelrc: false,
		caller: { name: "metro", bundler: "metro", platform: "ios", isDev: true },
	});
	return [...code.matchAll(/function (\w+)\(([^)]*)\)\{const\{([^}]*)\}=this\.__closure/g)].map(
		([, name, params, captured]) => ({ name, params, captured: captured.split(",") }),
	);
}

describe("worklet closures", () => {
	it(
		"finds worklets that capture constants",
		() => {
			expect(workletFiles.flatMap(uiWorklets).length).toBeGreaterThan(0);
		},
		TRANSFORM_ALL_MS,
	);

	// The UI thread unpacks captured constants at the top of the body, after default parameters
	// have run, so a default that reads one throws "Property doesn't exist"
	it.each(workletFiles)("%s: no default parameter reads a captured constant", (file) => {
		const offending = uiWorklets(file).flatMap(({ name, params, captured }) =>
			captured
				.filter((constant) => new RegExp(`=[^,]*\\b${constant}\\b`).test(params))
				.map((constant) => `${name} defaults a parameter to ${constant}`),
		);
		expect(offending).toEqual([]);
	});
});
