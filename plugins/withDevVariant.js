// Debug builds (`pnpm ios --device`) load JS from Metro, Release builds embed it. Give the
// Debug build its own bundle identifier so both can be installed side by side, and its own
// home-screen name so they can be told apart. The name comes from a per-configuration build
// setting that Info.plist reads.
const { withInfoPlist, withXcodeProject } = require("expo/config-plugins");

const SETTING = "APP_DISPLAY_NAME";
const DEV_SUFFIX = " Dev";
const DEV_BUNDLE_SUFFIX = ".dev";

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

module.exports = (config) => withDisplayNameFromSetting(withDevSettings(config));
module.exports.setDevVariant = setDevVariant;
