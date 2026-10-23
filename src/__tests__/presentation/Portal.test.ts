import {
	advanceEdge,
	EDGE_DRAIN_MS,
	EDGE_GROW_MS,
	edgeProgress,
	edgeRadius,
	portalReach,
	restRadius,
	rimFade,
	seatOf,
	smoothstep,
} from "../../presentation/effects/portal";

const field = { width: 400, height: 800, cornerExtent: 0 };

describe("where the portals open", () => {
	it("opens at the seat, where the player dot froze", () => {
		const player = { x: 150, y: 300, radius: 20, stretchX: 0.1, stretchY: 0 };
		expect(seatOf(player, field)).toBe(player);
	});

	it("opens from the middle of the field, at no size, when there is no player dot to open at", () => {
		expect(seatOf(null, field)).toEqual({ x: 200, y: 400, radius: 0, stretchX: 0, stretchY: 0 });
	});
});

describe("how the edge steps a frame", () => {
	it("grows at the edge's pace while growing, and stops at full", () => {
		expect(advanceEdge(0, true, EDGE_GROW_MS / 2)).toBeCloseTo(0.5, 9);
		expect(advanceEdge(0.9, true, EDGE_GROW_MS)).toBe(1);
		expect(advanceEdge(0, true, EDGE_GROW_MS / 2, 0.3)).toBe(0.3);
	});

	it("counts a step that falls short of full by rounding alone as full", () => {
		let progress = 0;
		for (let i = 0; i < 90; i++) progress = advanceEdge(progress, true, EDGE_GROW_MS / 90);
		expect(progress).toBe(1);
	});

	it("drains faster than it grows, and no further than nothing", () => {
		expect(advanceEdge(1, false, EDGE_DRAIN_MS / 2)).toBeCloseTo(0.5, 9);
		expect(advanceEdge(0.1, false, EDGE_DRAIN_MS)).toBe(0);
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
