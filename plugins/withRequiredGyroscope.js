// Keep the app off Android phones without a gyroscope. Their rotation vector comes from the
// accelerometer and compass alone, and the swivel would lean on that noisy compass heading, so
// the sensor adapter reports nothing there anyway (ADR 0010). Expo's app.json has no field for
// <uses-feature>, so add it to the manifest.
const { withAndroidManifest } = require("expo/config-plugins");

const GYROSCOPE = "android.hardware.sensor.gyroscope";

/** Declare the gyroscope as a required feature, once */
function requireGyroscope(manifest) {
	const features = manifest.manifest["uses-feature"] ?? [];
	const declared = features.find((feature) => feature.$["android:name"] === GYROSCOPE);
	if (declared) declared.$["android:required"] = "true";
	else features.push({ $: { "android:name": GYROSCOPE, "android:required": "true" } });
	manifest.manifest["uses-feature"] = features;
	return manifest;
}

const withRequiredGyroscope = (config) =>
	withAndroidManifest(config, (config) => {
		config.modResults = requireGyroscope(config.modResults);
		return config;
	});

module.exports = withRequiredGyroscope;
module.exports.requireGyroscope = requireGyroscope;
