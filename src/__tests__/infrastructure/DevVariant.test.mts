import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const app = require("../../../app.json");
const { setDevVariant, setAndroidDevVariant } = require("../../../plugins/withDevVariant.js") as {
	setDevVariant(
		configurations: Record<string, BuildConfiguration | string>,
		app: { name: string; bundleIdentifier: string },
	): Record<string, BuildConfiguration | string>;
	setAndroidDevVariant(buildGradle: string, app: { name: string }): string;
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
				PRODUCT_BUNDLE_IDENTIFIER: '"com.example.tiltling.debug"',
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

describe("Android dev variant", () => {
	const buildGradle = `android {
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            signingConfig signingConfigs.debug
        }
    }
}`;

	it("installs debug beside release under its own id and name", () => {
		const result = setAndroidDevVariant(buildGradle, { name: "Tiltling" });
		const debug = result.slice(result.indexOf("debug {"), result.indexOf("release {"));
		const release = result.slice(result.indexOf("release {"));
		expect(debug).toContain('applicationIdSuffix ".debug"');
		expect(debug).toContain('resValue "string", "app_name", "Tiltling Dev"');
		expect(release).not.toContain("applicationIdSuffix");
		expect(release).not.toContain("resValue");
	});

	it("applies once when prebuild runs again", () => {
		const once = setAndroidDevVariant(buildGradle, { name: "Tiltling" });
		expect(setAndroidDevVariant(once, { name: "Tiltling" })).toBe(once);
	});

	it("fails loudly when the debug build type is missing", () => {
		expect(() => setAndroidDevVariant("android {}", { name: "Tiltling" })).toThrow();
	});
});
