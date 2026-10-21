import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { configDefaults, defineConfig } from "vitest/config";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const srcRoot = path.join(root, "src") + path.sep;

// Resolved through Expo's dependencies, as Metro resolves them (see architecture/appBabel.mts)
const require = createRequire(path.join(root, "package.json"));
const expoPaths = { paths: [require.resolve("expo/package.json")] };
const babel = require(require.resolve("@babel/core", expoPaths)) as {
	transformSync(
		source: string,
		options: Record<string, unknown>,
	): { code: string; map: unknown } | null;
};
const workletsPlugin = require.resolve("react-native-worklets/plugin", expoPaths);

/**
 * Runs every source file that holds a `"worklet"` through the worklets Babel plugin, as the app
 * ships it, so the tests run the code the device runs: the plugin turns a worklet function
 * declaration into a constant made where it stands, no longer hoisted. Only that plugin runs;
 * types and modules are left for Vite. `envName: "production"` is how a Metro release build
 * calls Babel, which leaves out the dev-only extras (location, plugin version, `global.Error`).
 */
function workletsAsShipped(): Plugin {
	return {
		name: "worklets-as-shipped",
		enforce: "pre",
		transform(code, id) {
			const file = id.split("?")[0];
			if (!file.startsWith(srcRoot) || !/\.tsx?$/.test(file) || !code.includes('"worklet"')) {
				return null;
			}
			const result = babel.transformSync(code, {
				filename: file,
				configFile: false,
				babelrc: false,
				envName: "production",
				sourceType: "module",
				parserOpts: { plugins: file.endsWith("x") ? ["typescript", "jsx"] : ["typescript"] },
				plugins: [workletsPlugin],
				sourceMaps: true,
			});
			return result && { code: result.code, map: result.map as never };
		},
	};
}

export default defineConfig({
	plugins: [workletsAsShipped()],
	resolve: {
		alias: {
			"@": path.join(root, "src"),
		},
	},
	test: {
		globals: true,
		environment: "node",
		include: [
			"**/__tests__/**/*.test.ts",
			"**/__tests__/**/*.test.tsx",
			"**/__tests__/**/*.test.mts",
		],
		// Agent worktrees under .claude/ are whole repo copies, tests included
		exclude: [...configDefaults.exclude, ".claude/**"],
	},
});
