import app from "../../../app.json";

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
});
