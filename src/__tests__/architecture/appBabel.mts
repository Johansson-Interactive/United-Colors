import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const projectRoot = new URL("../../../", import.meta.url);
const require = createRequire(new URL("package.json", projectRoot));
// Resolved through Expo's dependencies, as Metro resolves it
const babel = require(
	require.resolve("@babel/core", { paths: [require.resolve("expo/package.json")] }),
) as {
	transformSync(source: string, options: Record<string, unknown>): { code: string };
};

/** The app's source directory, as an absolute path ending in a slash */
export const SRC_ROOT = fileURLToPath(new URL("src/", projectRoot));

/** How Metro would call Babel: the platform it bundles for, and whether in development */
interface MetroCaller {
	platform: "ios" | "android";
	isDev: boolean;
}

/** `source`, as if at `filename`, through the app's Babel config as Metro runs it */
export function transformAsMetro(source: string, filename: string, caller: MetroCaller): string {
	return babel.transformSync(source, {
		cwd: fileURLToPath(projectRoot),
		filename,
		configFile: fileURLToPath(new URL("babel.config.js", projectRoot)),
		babelrc: false,
		caller: { name: "metro", bundler: "metro", ...caller },
	}).code;
}
