import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const app = require("../../../app.json");
const { requireGyroscope } = require("../../../plugins/withRequiredGyroscope.js") as {
	requireGyroscope(manifest: AndroidManifest): AndroidManifest;
};

interface AndroidManifest {
	manifest: { "uses-feature"?: { $: Record<string, string> }[] };
}

const gyroscope = "android.hardware.sensor.gyroscope";

describe("Android sensor sampling", () => {
	it("blocks the activity-recognition permission inherited from expo-sensors", () => {
		// Tilt steering uses orientation, not step counting or physical-activity recognition.
		expect(app.expo.android.blockedPermissions).toContain(
			"android.permission.ACTIVITY_RECOGNITION",
		);
	});

	it("allows Expo to request fast sampling on Android 12 and later", () => {
		// expo-sensors falls back to SENSOR_DELAY_NORMAL without this manifest permission,
		// regardless of DeviceMotion.setUpdateInterval(0) on the JavaScript side.
		const permission = "android.permission.HIGH_SAMPLING_RATE_SENSORS";
		expect(app.expo.android).toMatchObject({
			permissions: expect.arrayContaining([permission]),
		});
		expect(app.expo.android.blockedPermissions).not.toContain(permission);
		expect(app.expo.android.blockedPermissions).not.toContain("HIGH_SAMPLING_RATE_SENSORS");
	});

	it("applies the required-gyroscope plugin", () => {
		expect(app.expo.plugins).toContain("./plugins/withRequiredGyroscope.js");
	});

	it("requires a gyroscope, which keeps gravity steady as the hand moves (ADR 0014)", () => {
		const touch = { $: { "android:name": "android.hardware.touchscreen" } };
		const manifest = { manifest: { "uses-feature": [touch] } };
		expect(requireGyroscope(manifest).manifest["uses-feature"]).toEqual([
			touch,
			{ $: { "android:name": gyroscope, "android:required": "true" } },
		]);
	});

	it("declares the gyroscope once, required even if it was declared optional", () => {
		const optional = { $: { "android:name": gyroscope, "android:required": "false" } };
		const manifest = requireGyroscope(
			requireGyroscope({ manifest: { "uses-feature": [optional] } }),
		);
		expect(manifest.manifest["uses-feature"]).toEqual([
			{ $: { "android:name": gyroscope, "android:required": "true" } },
		]);
	});

	it("declares the gyroscope in a manifest with no features yet", () => {
		expect(requireGyroscope({ manifest: {} }).manifest["uses-feature"]).toEqual([
			{ $: { "android:name": gyroscope, "android:required": "true" } },
		]);
	});
});
