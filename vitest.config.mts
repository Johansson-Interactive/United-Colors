import path from "node:path";
import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)));

export default defineConfig({
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
