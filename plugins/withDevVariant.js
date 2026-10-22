// Debug builds (`pnpm ios --device`, `pnpm android`) load JS from Metro, Release builds embed
// it. Give the Debug build its own app id so both can be installed side by side, and its own
// home-screen name so they can be told apart. On iOS the name comes from a per-configuration
// build setting that Info.plist reads. On Android the debug build type gets an id suffix and
// its own app_name; React Native's debugOptimized build type copies debug, so it follows.
const { withAppBuildGradle, withInfoPlist, withXcodeProject } = require("expo/config-plugins");

const SETTING = "APP_DISPLAY_NAME";
const DEV_SUFFIX = " Dev";
const DEV_BUNDLE_SUFFIX = ".debug";

/** Point the app target's Debug configuration at a separate dev app */
function setDevVariant(configurations, { name, bundleIdentifier }) {
	for (const configuration of Object.values(configurations)) {
		const settings = configuration?.buildSettings;
		// Only the app target's configurations point at an Info.plist.
		if (!settings?.INFOPLIST_FILE) continue;
		const isDebug = configuration.name === "Debug";
		settings[SETTING] = `"${name}${isDebug ? DEV_SUFFIX : ""}"`;
		settings.PRODUCT_BUNDLE_IDENTIFIER = `"${bundleIdentifier}${isDebug ? DEV_BUNDLE_SUFFIX : ""}"`;
	}
	return configurations;
}

/** Point the app's debug build type at a separate dev app */
function setAndroidDevVariant(buildGradle, { name }) {
	if (buildGradle.includes(`applicationIdSuffix "${DEV_BUNDLE_SUFFIX}"`)) return buildGradle;
	const debugBlock = /(buildTypes\s*\{\s*debug\s*\{)/;
	if (!debugBlock.test(buildGradle)) {
		throw new Error("withDevVariant: no debug build type in android/app/build.gradle");
	}
	return buildGradle.replace(
		debugBlock,
		`$1
            applicationIdSuffix "${DEV_BUNDLE_SUFFIX}"
            resValue "string", "app_name", ${JSON.stringify(`${name}${DEV_SUFFIX}`)}`,
	);
}

const withDevSettings = (config) =>
	withXcodeProject(config, (config) => {
		setDevVariant(config.modResults.pbxXCBuildConfigurationSection(), {
			name: config.name,
			bundleIdentifier: config.ios.bundleIdentifier,
		});
		return config;
	});

const withDisplayNameFromSetting = (config) =>
	withInfoPlist(config, (config) => {
		config.modResults.CFBundleDisplayName = `$(${SETTING})`;
		return config;
	});

const withAndroidDevBuildType = (config) =>
	withAppBuildGradle(config, (config) => {
		config.modResults.contents = setAndroidDevVariant(config.modResults.contents, {
			name: config.name,
		});
		return config;
	});

module.exports = (config) =>
	withAndroidDevBuildType(withDisplayNameFromSetting(withDevSettings(config)));
module.exports.setDevVariant = setDevVariant;
module.exports.setAndroidDevVariant = setAndroidDevVariant;
