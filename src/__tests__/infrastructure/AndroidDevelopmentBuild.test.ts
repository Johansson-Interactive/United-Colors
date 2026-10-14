import eas from "../../../eas.json";
import pkg from "../../../package.json";

/** Native build settings are part of the performance contract, even with the same JS bundle. */
describe("Android development builds", () => {
	it("enables native optimizations in the default local development command", () => {
		expect(pkg.scripts.android).toBe("expo run:android --variant debugOptimized");
	});

	it("uses the same optimized variant on EAS while retaining the development client", () => {
		expect(eas.build.development.developmentClient).toBe(true);
		expect(eas.build.development.android.gradleCommand).toBe(":app:assembleDebugOptimized");
	});
});
