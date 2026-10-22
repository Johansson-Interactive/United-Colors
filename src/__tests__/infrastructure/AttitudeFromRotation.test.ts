import { gravityOf, wholeTilt } from "../../domain/levelPose";
import { attitudeFromRotation } from "../../infrastructure/attitudeFromRotation";

/** The gravity formula the adapter used before it kept the swivel: the oracle for beta, gamma */
function oldGravity(beta: number, gamma: number) {
	return {
		x: Math.cos(beta) * Math.sin(gamma),
		y: -Math.sin(beta),
		z: -Math.cos(beta) * Math.cos(gamma),
	};
}

/** `angle` wrapped into [-pi, pi], as the sensor reports it */
function wrapped(angle: number): number {
	return Math.atan2(Math.sin(angle), Math.cos(angle));
}

const DEG = Math.PI / 180;

const angles = [-Math.PI, -2.5, -Math.PI / 2, -0.7, -0.1, 0, 0.3, 1, Math.PI / 2, 2.2, Math.PI];

describe("attitudeFromRotation", () => {
	it("gives the gravity the old formula gave, for any beta, gamma and alpha", () => {
		for (const alpha of angles) {
			for (const beta of angles.map((a) => a / 2)) {
				for (const gamma of angles) {
					const g = gravityOf(attitudeFromRotation(alpha, beta, gamma));
					const expected = oldGravity(beta, gamma);
					expect(g.x).toBeCloseTo(expected.x);
					expect(g.y).toBeCloseTo(expected.y);
					expect(g.z).toBeCloseTo(expected.z);
				}
			}
		}
	});

	it("lying flat, a growing alpha alone reads as no tilt: the flat spin on a tabletop", () => {
		const pose = attitudeFromRotation(0.4, 0, 0);
		const tilt = wholeTilt(attitudeFromRotation(1.4, 0, 0), pose);
		expect(tilt.x).toBeCloseTo(0);
		expect(tilt.y).toBeCloseTo(0);
	});

	it("held upright, a growing alpha reads as a roll with the right edge turning away", () => {
		// Counterclockwise seen from above, the right edge of a phone facing the player swings
		// away from them, which is a positive roll
		const pose = attitudeFromRotation(0, Math.PI / 2, 0);
		const tilt = wholeTilt(attitudeFromRotation(0.3, Math.PI / 2, 0), pose);
		expect(tilt.x).toBeCloseTo(0.3);
		expect(tilt.y).toBeCloseTo(0);
	});

	it("tipped back through upright, the tilt reads on smoothly where the angles jump", () => {
		// Past upright beta turns back from pi/2 and alpha and gamma flip by pi, as Android
		// reports a phone leaning back beyond the vertical, though the phone has barely moved
		const alpha = 2.5;
		const gamma = 0.1;
		const samples: [number, number, number][] = [];
		for (let beta = 80; beta <= 90; beta++) samples.push([alpha, beta * DEG, gamma]);
		for (let beta = 89; beta >= 80; beta--) {
			samples.push([wrapped(alpha + Math.PI), beta * DEG, wrapped(gamma + Math.PI)]);
		}
		const pose = attitudeFromRotation(...samples[0]);
		const tilts = samples.map((s) => wholeTilt(attitudeFromRotation(...s), pose));
		for (let i = 1; i < tilts.length; i++) {
			const step = Math.hypot(tilts[i].x - tilts[i - 1].x, tilts[i].y - tilts[i - 1].y);
			expect(step).toBeLessThan(1.5 * DEG);
		}
		// Ten degrees up to the vertical and ten beyond it: twenty degrees of the top edge leaning in
		expect(tilts[tilts.length - 1].y).toBeCloseTo(20 * DEG, 2);
	});
});
