import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const projectRoot = new URL("../../../", import.meta.url);
const require = createRequire(new URL("package.json", projectRoot));
const babel = require(
	require.resolve("@babel/core", { paths: [require.resolve("expo/package.json")] }),
) as {
	transformSync(source: string, options: Record<string, unknown>): { code: string };
};

describe("release Babel configuration", () => {
	it("transforms TypeScript with the preset available through Expo's dependencies", () => {
		const result = babel.transformSync("export const score: number = 42;", {
			cwd: fileURLToPath(projectRoot),
			filename: fileURLToPath(new URL("src/bundle-check.ts", projectRoot)),
			configFile: fileURLToPath(new URL("babel.config.js", projectRoot)),
			babelrc: false,
			caller: { name: "metro", bundler: "metro", platform: "android", isDev: false },
		});

		expect(result.code).toContain("42");
		expect(result.code).not.toContain(": number");
	});
});
