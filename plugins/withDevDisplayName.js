// Debug builds (`pnpm ios --device`) load JS from Metro, Release builds embed it. Give the
// Debug build its own home-screen name so the two can be told apart. The name comes from a
// per-configuration build setting that Info.plist reads.
const { withInfoPlist, withXcodeProject } = require("expo/config-plugins");

const SETTING = "APP_DISPLAY_NAME";
const DEV_SUFFIX = " Dev";

const withDisplayNameSetting = (config) =>
	withXcodeProject(config, (config) => {
		const configurations = config.modResults.pbxXCBuildConfigurationSection();
		for (const configuration of Object.values(configurations)) {
			const settings = configuration?.buildSettings;
			// Only the app target's configurations point at an Info.plist.
			if (!settings?.INFOPLIST_FILE) continue;
			const suffix = configuration.name === "Debug" ? DEV_SUFFIX : "";
			settings[SETTING] = `"${config.name}${suffix}"`;
		}
		return config;
	});

const withDisplayNameFromSetting = (config) =>
	withInfoPlist(config, (config) => {
		config.modResults.CFBundleDisplayName = `$(${SETTING})`;
		return config;
	});

module.exports = (config) => withDisplayNameFromSetting(withDisplayNameSetting(config));
