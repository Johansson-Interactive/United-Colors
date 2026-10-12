/**
 * The tilt speeds the interface offers. The setting itself is a multiple of the default speed
 * (see GameSettings.tiltSensitivity); the pause menu picks from these three.
 */

type SensitivityKey = "slow" | "normal" | "fast";

export interface SensitivityChoice {
	key: SensitivityKey;
	/** The multiple of the default speed this choice sets */
	value: number;
	label: string;
}

/** In rising order, so a menu can stack them with the fastest on top */
export const SENSITIVITY_CHOICES: readonly SensitivityChoice[] = [
	{ key: "slow", value: 0.65, label: "Slow" },
	{ key: "normal", value: 1, label: "Normal" },
	{ key: "fast", value: 1.5, label: "Fast" },
];

/** The choice nearest a stored sensitivity, so any persisted value shows as one of the three */
export function sensitivityChoice(value: number): SensitivityChoice {
	let nearest = SENSITIVITY_CHOICES[0];
	for (const choice of SENSITIVITY_CHOICES) {
		if (Math.abs(choice.value - value) < Math.abs(nearest.value - value)) nearest = choice;
	}
	return nearest;
}
