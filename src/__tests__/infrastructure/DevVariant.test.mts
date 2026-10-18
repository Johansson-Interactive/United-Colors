import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const app = require("../../../app.json");
const { setDevVariant } = require("../../../plugins/withDevVariant.js") as {
	setDevVariant(
		configurations: Record<string, BuildConfiguration | string>,
		app: { name: string; bundleIdentifier: string },
	): Record<string, BuildConfiguration | string>;
};

interface BuildConfiguration {
	name: string;
	buildSettings: Record<string, string>;
}

const appTarget = (name: string): BuildConfiguration => ({
	name,
	buildSettings: { INFOPLIST_FILE: "Tiltling/Info.plist" },
});

describe("Dev variant", () => {
	it("applies the iOS dev variant plugin", () => {
		expect(app.expo.plugins).toContain("./plugins/withDevVariant.js");
	});

	it("installs Debug beside Release under its own id and name", () => {
		const configurations = setDevVariant(
			{ debug: appTarget("Debug"), release: appTarget("Release"), debug_comment: "Debug" },
			{ name: "Tiltling", bundleIdentifier: "com.example.tiltling" },
		);
		expect(configurations.debug).toMatchObject({
			buildSettings: {
				APP_DISPLAY_NAME: '"Tiltling Dev"',
				PRODUCT_BUNDLE_IDENTIFIER: '"com.example.tiltling.dev"',
			},
		});
		expect(configurations.release).toMatchObject({
			buildSettings: {
				APP_DISPLAY_NAME: '"Tiltling"',
				PRODUCT_BUNDLE_IDENTIFIER: '"com.example.tiltling"',
			},
		});
	});

	it("leaves configurations without an Info.plist alone", () => {
		const project = { name: "Debug", buildSettings: {} };
		setDevVariant({ project }, { name: "Tiltling", bundleIdentifier: "com.example.tiltling" });
		expect(project.buildSettings).toEqual({});
	});
});
