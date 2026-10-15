// Tell Android this is a game: it files the app under Games and lets the system's game
// features (Game Dashboard, per-game performance modes) apply. Expo's app.json has no field
// for android:appCategory, so set it on <application>. iOS reads its category from Info.plist.
const { withAndroidManifest } = require("expo/config-plugins");

/** Mark the manifest's <application> as a game */
function setGameCategory(manifest) {
	for (const application of manifest.manifest.application ?? []) {
		application.$["android:appCategory"] = "game";
	}
	return manifest;
}

const withGameCategory = (config) =>
	withAndroidManifest(config, (config) => {
		config.modResults = setGameCategory(config.modResults);
		return config;
	});

module.exports = withGameCategory;
module.exports.setGameCategory = setGameCategory;
