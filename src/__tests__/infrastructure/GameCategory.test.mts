import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const app = require("../../../app.json");
const { setGameCategory } = require("../../../plugins/withGameCategory.js") as {
	setGameCategory(manifest: AndroidManifest): AndroidManifest;
};

interface AndroidManifest {
	manifest: { application: { $: Record<string, string> }[] };
}

describe("Game category", () => {
	it("files the iOS app under Games and opts in to Game Mode", () => {
		expect(app.expo.ios.infoPlist).toMatchObject({
			LSApplicationCategoryType: "public.app-category.games",
			GCSupportsGameMode: true,
		});
	});

	it("applies the Android category plugin", () => {
		expect(app.expo.plugins).toContain("./plugins/withGameCategory.js");
	});

	it("marks the Android application as a game", () => {
		const manifest = {
			manifest: { application: [{ $: { "android:name": ".MainApplication" } }] },
		};
		expect(setGameCategory(manifest).manifest.application[0].$).toEqual({
			"android:name": ".MainApplication",
			"android:appCategory": "game",
		});
	});
});
