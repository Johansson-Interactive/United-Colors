import {
	EDGE_DRAIN_MS,
	EDGE_GROW_MS,
	edgeProgress,
	edgeRadius,
	PAUSE_ALL,
	PLAY_ALL,
	playShows,
	portalReach,
	restRadius,
	rimFade,
	smoothstep,
} from "../../presentation/effects/portal";

const field = { width: 400, height: 800, cornerExtent: 0 };

describe("where the play side shows through the portal", () => {
	it("shows all of play with the play world all over, as in play itself", () => {
		expect(playShows(PLAY_ALL)).toBe("all");
	});

	it("shows none of play with the pause world all over, as on the pause screen", () => {
		expect(playShows(PAUSE_ALL)).toBe("none");
	});

	it("shows play outside the bloom's portal, the pause inside it", () => {
		expect(playShows({ x: 10, y: 10, radius: 30, inside: "pause" })).toBe("outside");
	});

	it("shows play inside Get ready's portal, the pause outside it", () => {
		expect(playShows({ x: 10, y: 10, radius: 30, inside: "play" })).toBe("inside");
	});

	it("shows all of play once a bloom's portal has drained to nothing", () => {
		expect(playShows({ x: 10, y: 10, radius: 0, inside: "pause" })).toBe("all");
	});
});

describe("how the edge grows", () => {
	const rest = restRadius(20);
	const reach = portalReach({ x: 150, y: 300 }, field);

	it("rests a little clear of the dot it opens around", () => {
		expect(rest).toBeGreaterThan(20);
		expect(rest).toBeLessThan(40);
	});

	it("reaches from its centre to the farthest corner of the field", () => {
		expect(reach).toBeCloseTo(Math.hypot(250, 500), 9);
		expect(portalReach({ x: 200, y: 400 }, field)).toBeCloseTo(Math.hypot(200, 400), 9);
	});

	it("goes from rest to the reach, easing in and out", () => {
		expect(edgeRadius(0, rest, reach)).toBe(rest);
		expect(edgeRadius(1, rest, reach)).toBe(reach);
		expect(edgeRadius(0.5, rest, reach)).toBeCloseTo((rest + reach) / 2, 9);
		const linear = rest + (reach - rest) * 0.25;
		expect(edgeRadius(0.25, rest, reach)).toBeLessThan(linear);
		expect(edgeRadius(0.75, rest, reach)).toBeGreaterThan(rest + (reach - rest) * 0.75);
	});

	it("grows monotonically", () => {
		let previous = 0;
		for (let p = 0; p <= 1; p += 0.05) {
			const r = edgeRadius(p, rest, reach);
			expect(r).toBeGreaterThanOrEqual(previous);
			previous = r;
		}
	});

	it("tells how far along its growth it reaches a radius, the way back from edgeRadius", () => {
		expect(edgeProgress(rest, rest, reach)).toBe(0);
		expect(edgeProgress(reach, rest, reach)).toBe(1);
		expect(edgeProgress((rest + reach) / 2, rest, reach)).toBeCloseTo(0.5, 9);
		// smoothstep(0.25) is 0.15625
		expect(edgeProgress(rest + (reach - rest) * 0.15625, rest, reach)).toBeCloseTo(0.25, 9);
		expect(edgeProgress(0, rest, reach)).toBe(0);
		expect(edgeProgress(reach * 2, rest, reach)).toBe(1);
	});

	it("drains faster than it grows", () => {
		expect(EDGE_DRAIN_MS).toBeLessThan(EDGE_GROW_MS);
	});

	it("eases softly at both ends", () => {
		expect(smoothstep(0)).toBe(0);
		expect(smoothstep(0.5)).toBe(0.5);
		expect(smoothstep(1)).toBe(1);
		expect(smoothstep(-1)).toBe(0);
		expect(smoothstep(2)).toBe(1);
	});
});

describe("the rim's fade", () => {
	it("holds in full until the edge is well on its way to the walls, then fades to nothing", () => {
		expect(rimFade(0)).toBe(1);
		expect(rimFade(0.6)).toBe(1);
		expect(rimFade(0.8)).toBeLessThan(1);
		expect(rimFade(0.8)).toBeGreaterThan(0);
		expect(rimFade(1)).toBe(0);
	});
});
