import { gravityTilt } from "../../domain/levelPose";
import { gravityFromRotation } from "../../infrastructure/gravityFromRotation";

/** `angle` wrapped into [-pi, pi], as the sensor reports it */
function wrapped(angle: number): number {
	return Math.atan2(Math.sin(angle), Math.cos(angle));
}

const DEG = Math.PI / 180;

describe("gravityFromRotation", () => {
	it("lying flat, gravity points out of the back of the screen", () => {
		const g = gravityFromRotation(0, 0);
		expect(g.x).toBeCloseTo(0);
		expect(g.y).toBeCloseTo(0);
		expect(g.z).toBeCloseTo(-1);
	});

	it("is a unit direction for any beta and gamma", () => {
		for (const beta of [-Math.PI / 2, -0.7, 0, 0.3, Math.PI / 2]) {
			for (const gamma of [-Math.PI, -2.5, -0.1, 0, 1, 2.2, Math.PI]) {
				const g = gravityFromRotation(beta, gamma);
				expect(Math.hypot(g.x, g.y, g.z)).toBeCloseTo(1);
			}
		}
	});

	it("tipped back through upright, the tilt reads on smoothly where the angles jump", () => {
		// Past upright beta turns back from pi/2 and gamma flips by pi, as Android reports a
		// phone leaning back beyond the vertical, though the phone has barely moved
		const gamma = 0.1;
		const samples: [number, number][] = [];
		for (let beta = 80; beta <= 90; beta++) samples.push([beta * DEG, gamma]);
		for (let beta = 89; beta >= 80; beta--) samples.push([beta * DEG, wrapped(gamma + Math.PI)]);
		const pose = gravityFromRotation(...samples[0]);
		const tilts = samples.map((s) => gravityTilt(gravityFromRotation(...s), pose, "up"));
		for (let i = 1; i < tilts.length; i++) {
			const step = Math.hypot(tilts[i].x - tilts[i - 1].x, tilts[i].y - tilts[i - 1].y);
			expect(step).toBeLessThan(1.5 * DEG);
		}
		// Ten degrees up to the vertical and ten beyond it: twenty degrees of the top edge leaning in
		expect(tilts[tilts.length - 1].y).toBeCloseTo(20 * DEG, 2);
	});
});
