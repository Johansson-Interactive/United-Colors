import type { Attitude } from "../../domain/types";
import { attitudeFromRotation } from "../../infrastructure/attitudeFromRotation";

/** The gravity formula the adapter used before it kept the swivel: the oracle for beta, gamma */
function oldGravity(beta: number, gamma: number) {
	return {
		x: Math.cos(beta) * Math.sin(gamma),
		y: -Math.sin(beta),
		z: -Math.cos(beta) * Math.cos(gamma),
	};
}

/** Gravity in the phone's axes, as the Attitude doc defines it */
function gravityOf(a: Attitude) {
	return { x: -a.xz, y: -a.yz, z: -a.zz };
}

type Vec = readonly [number, number, number];

function dot(a: Vec, b: Vec) {
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

const axes = (a: Attitude) => ({
	x: [a.xx, a.xy, a.xz] as const,
	y: [a.yx, a.yy, a.yz] as const,
	z: [a.zx, a.zy, a.zz] as const,
});

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

	it("flat and unturned, the phone's axes are the room's", () => {
		const { x, y, z } = axes(attitudeFromRotation(0, 0, 0));
		expect(dot(x, [1, 0, 0])).toBeCloseTo(1);
		expect(dot(y, [0, 1, 0])).toBeCloseTo(1);
		expect(dot(z, [0, 0, 1])).toBeCloseTo(1);
	});

	it("lying flat, a growing alpha swivels the top edge counterclockwise seen from above", () => {
		const { x, y, z } = axes(attitudeFromRotation(Math.PI / 2, 0, 0));
		// The top edge, which pointed along the room's y, now points along its -x
		expect(dot(y, [-1, 0, 0])).toBeCloseTo(1);
		expect(dot(x, [0, 1, 0])).toBeCloseTo(1);
		expect(dot(z, [0, 0, 1])).toBeCloseTo(1);
	});

	it("held upright, alpha still swivels the phone though gravity cannot see it", () => {
		const a = attitudeFromRotation(0, Math.PI / 2, 0);
		const b = attitudeFromRotation(0.5, Math.PI / 2, 0);
		expect(gravityOf(b).y).toBeCloseTo(gravityOf(a).y);
		// The screen's normal turned half a radian about the vertical
		expect(dot(axes(a).z, axes(b).z)).toBeCloseTo(Math.cos(0.5));
	});

	it("is a rotation: unit axes at right angles, right-handed", () => {
		for (const [alpha, beta, gamma] of [
			[0.4, -1.1, 2.9],
			[-2, 0.6, -0.3],
			[3, 1.5, 1],
		]) {
			const { x, y, z } = axes(attitudeFromRotation(alpha, beta, gamma));
			expect(dot(x, x)).toBeCloseTo(1);
			expect(dot(y, y)).toBeCloseTo(1);
			expect(dot(x, y)).toBeCloseTo(0);
			// x cross y = z
			expect(x[1] * y[2] - x[2] * y[1]).toBeCloseTo(z[0]);
			expect(x[2] * y[0] - x[0] * y[2]).toBeCloseTo(z[1]);
			expect(x[0] * y[1] - x[1] * y[0]).toBeCloseTo(z[2]);
		}
	});
});
