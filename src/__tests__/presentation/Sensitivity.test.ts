import {
	DEFAULT_SETTINGS,
	TILT_SENSITIVITY_MAX,
	TILT_SENSITIVITY_MIN,
} from "../../domain/constants";
import { SENSITIVITY_CHOICES, sensitivityChoice } from "../../presentation/tilt/sensitivity";

describe("tilt speed choices", () => {
	it("rise from slow to fast, with the default in the middle", () => {
		expect(SENSITIVITY_CHOICES.map((c) => c.key)).toEqual(["slow", "normal", "fast"]);
		const values = SENSITIVITY_CHOICES.map((c) => c.value);
		expect([...values].sort((a, b) => a - b)).toEqual(values);
		expect(SENSITIVITY_CHOICES[1].value).toBe(DEFAULT_SETTINGS.tiltSensitivity);
	});

	it("stay within the range the game keeps", () => {
		for (const { value } of SENSITIVITY_CHOICES) {
			expect(value).toBeGreaterThanOrEqual(TILT_SENSITIVITY_MIN);
			expect(value).toBeLessThanOrEqual(TILT_SENSITIVITY_MAX);
		}
	});

	it("each choice is its own nearest", () => {
		for (const choice of SENSITIVITY_CHOICES) {
			expect(sensitivityChoice(choice.value)).toBe(choice);
		}
	});

	it("any other stored value shows as the nearest choice", () => {
		expect(sensitivityChoice(1.2).key).toBe("normal");
		expect(sensitivityChoice(1.3).key).toBe("fast");
		expect(sensitivityChoice(0.7).key).toBe("slow");
		expect(sensitivityChoice(TILT_SENSITIVITY_MAX).key).toBe("fast");
		expect(sensitivityChoice(TILT_SENSITIVITY_MIN).key).toBe("slow");
	});
});
