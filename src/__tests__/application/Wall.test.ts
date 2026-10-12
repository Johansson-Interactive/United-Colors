import {
	DRIP_STRETCH,
	LAUNCH_STRETCH,
	launchStretch,
	PLAYER_PRESS,
	PLAYER_PUSH_SPEED,
	pressDepth,
	pressedRadius,
	stepPress,
} from "../../application/wall";

describe("wall curves", () => {
	it("a launched drip leaves the wall as drawn out as it was forming, longer through the tear, round at the end", () => {
		expect(launchStretch(0)).toBe(DRIP_STRETCH);
		expect(launchStretch(0.5)).toBeCloseTo(DRIP_STRETCH / 2 + LAUNCH_STRETCH);
		expect(launchStretch(0.3)).toBeGreaterThan(launchStretch(0));
		expect(launchStretch(1)).toBe(0);
	});

	it("the player presses in as hard as they push, never past the deepest", () => {
		expect(pressDepth(0, 20)).toBe(0);
		expect(pressDepth(PLAYER_PUSH_SPEED, 20)).toBeCloseTo(20 * PLAYER_PRESS * Math.tanh(1));
		expect(pressDepth(-PLAYER_PUSH_SPEED, 20)).toBe(pressDepth(PLAYER_PUSH_SPEED, 20));
		expect(pressDepth(1e9, 20)).toBeLessThanOrEqual(20 * PLAYER_PRESS);
		expect(pressDepth(100, 20)).toBeLessThan(pressDepth(200, 20));
	});

	it("the press follows the push with a short lag, quicker to rise than to let go", () => {
		expect(stepPress(0, 300, 0)).toBe(0);
		let press = 0;
		for (let i = 0; i < 30; i++) press = stepPress(press, 300, 16);
		expect(press).toBeCloseTo(300, 0);
		const rising = stepPress(0, 300, 16);
		const falling = 300 - stepPress(300, 0, 16);
		expect(rising).toBeGreaterThan(0);
		expect(rising).toBeLessThan(300);
		expect(falling).toBeLessThan(rising);
		for (let i = 0; i < 60; i++) press = stepPress(press, 0, 16);
		// Settles exactly, so a release ends instead of trailing off forever
		expect(press).toBe(0);
	});

	it("a body pressed into a wall widens so what is left on the screen keeps its area", () => {
		expect(pressedRadius(20, 0)).toBe(20);
		expect(pressedRadius(20, -1)).toBe(20);
		for (const press of [2, 6, 10]) {
			const drawn = pressedRadius(20, press);
			expect(drawn).toBeGreaterThan(20);
			const u = (20 - press) / drawn;
			const kept = drawn * drawn * (Math.PI - Math.acos(u) + u * Math.sqrt(1 - u * u));
			expect(kept / (Math.PI * 400)).toBeCloseTo(1, 2);
		}
		expect(pressedRadius(20, 6)).toBeGreaterThan(pressedRadius(20, 2));
	});
});
