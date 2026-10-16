// Reanimated's own easings, which drove the bursts when they were views: the curves are checked
// against them, not against a copy of the maths
import { Easing } from "react-native-reanimated/lib/module/Easing";
import { GAME_COLORS } from "../../domain/constants";
import { layoutDotMatrix, matrixBox } from "../../presentation/dotmatrix/layout";
import {
	POP_DOT_CELL,
	POP_DOT_PX,
	POP_DOT_SPRITE,
	POP_GLOW_CELL,
	POP_GLOW_PX,
	POP_GLOW_SPRITE,
	plainKit,
	type SpritePlacement,
} from "../../presentation/dotSprites";
import {
	advanceBursts,
	BURST_COLORS,
	BURST_LIFETIME_MS,
	type Burst,
	burstColor,
	burstSprites,
	MAX_BURSTS,
	NOT_STARTED,
	POP_DOT_SCALE,
	POP_PITCH,
	packBursts,
	popBurst,
	popOpacity,
	popProgress,
	popRise,
	popScale,
	ringBorder,
	ringBurst,
	ringOpacity,
	ringProgress,
	ringScale,
	withBurst,
} from "../../presentation/effects/burstFrames";
import { COMBO_AMBER, WHITE } from "../../presentation/theme/theme";

const COLORS = BURST_COLORS.map((_, i) => Float32Array.of(i / 10, 0.5, 1, 1));
const AGES = [0, 16, 100, 225, 450, 540, 700, 899];

/** Where a placement puts the point (u, v) of its cell, as Skia applies an RSXform */
function place(p: SpritePlacement, u: number, v: number): [number, number] {
	return [p.scos * u - p.ssin * v + p.tx, p.ssin * u + p.scos * v + p.ty];
}

const outCubic = Easing.out(Easing.cubic);
const outQuad = Easing.out(Easing.quad);

/** The old pop view's style at `age` ms, as its useAnimatedStyle wrote it */
function oldPopStyle(age: number, x: number, y: number) {
	const t = outCubic(Math.min(1, age / BURST_LIFETIME_MS));
	return {
		opacity: t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4,
		translateX: x - 120 / 2,
		translateY: y - 30 - t * 46,
		scale: 0.7 + Math.min(t * 4, 1) * 0.5,
	};
}

/**
 * Where the old pop view drew each dot, and at what radius: a 120 px wide box at the origin,
 * the text's padded canvas centred in it, the box translated and then scaled about its centre
 */
function oldPopDots(text: string, age: number, x: number, y: number) {
	const layout = layoutDotMatrix(text);
	const box = matrixBox(layout, POP_PITCH, true, false);
	const style = oldPopStyle(age, x, y);
	const centre = { x: 120 / 2, y: box.height / 2 };
	const left = (120 - box.width) / 2;
	return layout.dots.map((dot) => {
		const local = {
			x: left + box.pad + (dot.col + 0.5) * POP_PITCH,
			y: box.pad + (dot.row + 0.5) * POP_PITCH,
		};
		return {
			x: centre.x + style.translateX + style.scale * (local.x - centre.x),
			y: centre.y + style.translateY + style.scale * (local.y - centre.y),
			radius: POP_PITCH * POP_DOT_SCALE * style.scale,
		};
	});
}

function started(burst: Burst, start: number): Burst {
	return { ...burst, start };
}

describe("the pop's curves", () => {
	it("ease out as the view's cubic timing did, and hold at the end", () => {
		for (const age of AGES) {
			expect(popProgress(age)).toBeCloseTo(outCubic(age / BURST_LIFETIME_MS), 12);
		}
		expect(popProgress(-5)).toBe(0);
		expect(popProgress(BURST_LIFETIME_MS * 2)).toBe(1);
	});

	it("fade, swell and rise as the view's style did", () => {
		for (const age of AGES) {
			const t = popProgress(age);
			const style = oldPopStyle(age, 0, 0);
			expect(popOpacity(t)).toBeCloseTo(style.opacity, 12);
			expect(popScale(t)).toBeCloseTo(style.scale, 12);
			expect(-30 - popRise(t)).toBeCloseTo(style.translateY, 12);
		}
	});

	it("is whole until 60 % of the way, then fades out to nothing", () => {
		expect(popOpacity(0.6)).toBe(1);
		expect(popOpacity(0.8)).toBeCloseTo(0.5, 12);
		expect(popOpacity(1)).toBeCloseTo(0, 12);
		expect(popScale(0)).toBeCloseTo(0.7, 12);
		expect(popScale(0.25)).toBeCloseTo(1.2, 12);
		expect(popScale(1)).toBeCloseTo(1.2, 12);
	});
});

describe("the ring's curves", () => {
	it("ease out as the view's quad timing did", () => {
		for (const age of AGES) {
			expect(ringProgress(age)).toBeCloseTo(outQuad(age / BURST_LIFETIME_MS), 12);
		}
	});

	it("fade, thin and grow as the view's style did", () => {
		const t = ringProgress(450);
		expect(t).toBeCloseTo(0.75, 12);
		expect(ringOpacity(t)).toBeCloseTo(0.225, 12);
		expect(ringBorder(t)).toBeCloseTo(4.25, 12);
		expect(ringScale(t)).toBeCloseTo(7.05, 12);
		expect(ringOpacity(0)).toBeCloseTo(0.9, 12);
		expect(ringBorder(0)).toBe(8);
		expect(ringScale(0)).toBeCloseTo(0.3, 12);
	});
});

describe("packBursts", () => {
	it("puts a pop's dots and glows where the view drew them, at every age", () => {
		const pop = popBurst(0, 140, 300, "+12", 0);
		const out = burstSprites(plainKit());
		for (const age of AGES) {
			packBursts([started(pop, 1000)], 1000 + age, COLORS, out);
			const expected = oldPopDots("+12", age, 140, 300);
			expect(out.dots.count).toBe(expected.length);
			expect(out.glows.count).toBe(expected.length);
			const n = out.dots.count;
			expected.forEach((dot, i) => {
				const body = out.dots.placements[n][i];
				const [cx, cy] = place(body, POP_DOT_CELL / 2, POP_DOT_CELL / 2);
				expect(cx).toBeCloseTo(dot.x, 9);
				expect(cy).toBeCloseTo(dot.y, 9);
				expect(body.scos * POP_DOT_PX).toBeCloseTo(dot.radius, 9);
				expect(out.dots.cells[n][i]).toBe(POP_DOT_SPRITE);
				const glow = out.glows.placements[n][i];
				const [gx, gy] = place(glow, POP_GLOW_CELL / 2, POP_GLOW_CELL / 2);
				expect(gx).toBeCloseTo(dot.x, 9);
				expect(gy).toBeCloseTo(dot.y, 9);
				// DotMatrixText's glow: 2.6 times the dot's radius
				expect(glow.scos * POP_GLOW_PX).toBeCloseTo(dot.radius * 2.6, 9);
				expect(out.glows.cells[n][i]).toBe(POP_GLOW_SPRITE);
			});
		}
	});

	it("tints a pop's dots and glows in its colour at its opacity", () => {
		const pop = popBurst(0, 0, 0, "+1", 3);
		const out = burstSprites(plainKit());
		packBursts([started(pop, 0)], 600, COLORS, out);
		const n = out.dots.count;
		const tint = out.dots.colors[n][0];
		expect(Array.from(tint.slice(0, 3))).toEqual(Array.from(COLORS[3].slice(0, 3)));
		expect(tint[3]).toBeCloseTo(popOpacity(popProgress(600)), 6);
		expect(out.glows.colors[n].every((c) => c === tint)).toBe(true);
		expect(out.dots.colors[n].every((c) => c === tint)).toBe(true);
	});

	it("strokes a ring through the middle of the view's border, scaled about the burst", () => {
		const out = burstSprites(plainKit());
		packBursts([started(ringBurst(0, 50, 60, 2, 80), 0)], 450, COLORS, out);
		expect(out.ringCount).toBe(1);
		const ring = out.rings[0];
		const t = ringProgress(450);
		const scale = ringScale(t);
		const border = ringBorder(t);
		// The view: a circle 80 across, its border inside it, scaled about its centre
		const outer = (scale * 80) / 2;
		expect(ring.radius + ring.width / 2).toBeCloseTo(outer, 9);
		expect(ring.width).toBeCloseTo(scale * border, 9);
		expect(ring).toMatchObject({ x: 50, y: 60, color: 2 });
		expect(ring.alpha).toBeCloseTo(ringOpacity(t), 12);
	});

	it("is 60 px across unless the burst says otherwise", () => {
		expect(ringBurst(0, 0, 0, 0).size).toBe(60);
	});

	it("draws a burst not yet stamped as at its start, and none past its lifetime", () => {
		const out = burstSprites(plainKit());
		const fresh = popBurst(0, 0, 0, "+1", 0);
		const old = started(popBurst(1, 0, 0, "+100", 0), 0);
		const ring = started(ringBurst(2, 0, 0, 0), 0);
		packBursts([old, ring, fresh], BURST_LIFETIME_MS, COLORS, out);
		expect(out.dots.count).toBe(fresh.dots.length / 2);
		expect(out.ringCount).toBe(0);
		expect(out.dots.colors[out.dots.count][0][3]).toBe(1);
	});

	it("draws several pops, every glow below every dot, each in its own tint", () => {
		const out = burstSprites(plainKit());
		const a = started(popBurst(0, 0, 0, "+1", 0), 0);
		const b = started(popBurst(1, 0, 0, "+2", 1), 0);
		packBursts([a, b], 100, COLORS, out);
		const n = out.dots.count;
		expect(n).toBe((a.dots.length + b.dots.length) / 2);
		expect(out.dots.colors[n][0]).not.toBe(out.dots.colors[n][n - 1]);
		expect(out.dots.colors[n][n - 1][0]).toBeCloseTo(COLORS[1][0], 6);
	});

	it("reuses its arrays and objects from frame to frame", () => {
		const out = burstSprites(plainKit());
		const list = [started(popBurst(0, 0, 0, "+5", 0), 0)];
		packBursts(list, 10, COLORS, out);
		const n = out.dots.count;
		const placements = out.dots.placements[n];
		const first = placements[0];
		const tint = out.dots.colors[n][0];
		packBursts(list, 20, COLORS, out);
		expect(out.dots.placements[n]).toBe(placements);
		expect(out.dots.placements[n][0]).toBe(first);
		expect(out.dots.colors[n][0]).toBe(tint);
	});
});

describe("popBurst", () => {
	it("lays its text out once, as offsets from the text's centre", () => {
		const pop = popBurst(7, 10, 20, "+3", 1);
		const layout = layoutDotMatrix("+3");
		expect(pop).toMatchObject({ id: 7, kind: "pop", x: 10, y: 20, color: 1, start: NOT_STARTED });
		expect(pop.dots).toHaveLength(layout.dots.length * 2);
		const xs = pop.dots.filter((_, i) => i % 2 === 0);
		// Symmetric about the centre: the outermost columns are as far either side
		expect(Math.min(...xs) + Math.max(...xs)).toBeCloseTo(0, 9);
	});
});

describe("burstColor", () => {
	it("indexes the game's colours, the combo's amber and white", () => {
		GAME_COLORS.forEach((color, i) => {
			expect(burstColor(color)).toBe(i);
		});
		expect(BURST_COLORS[burstColor(COMBO_AMBER)]).toBe(COMBO_AMBER);
		expect(BURST_COLORS[burstColor(WHITE)]).toBe(WHITE);
		expect(BURST_COLORS[burstColor("#123456")]).toBe(WHITE);
	});
});

describe("the burst list", () => {
	const ring = (id: number) => ringBurst(id, 0, 0, 0);

	it("adds a burst at the end, without changing the list it was given", () => {
		const list = [ring(0)];
		const next = withBurst(list, ring(1));
		expect(next.map((b) => b.id)).toEqual([0, 1]);
		expect(list).toHaveLength(1);
	});

	it("keeps at most MAX_BURSTS, dropping the oldest first", () => {
		let list: Burst[] = [];
		for (let id = 0; id < MAX_BURSTS + 3; id++) list = withBurst(list, ring(id));
		expect(list).toHaveLength(MAX_BURSTS);
		expect(list.map((b) => b.id)).toEqual(Array.from({ length: MAX_BURSTS }, (_, i) => i + 3));
	});

	it("starts a burst at the frame it is first seen in", () => {
		const list = withBurst([], ring(0));
		expect(advanceBursts(list, 500)).toBe(list);
		expect(list[0].start).toBe(500);
		advanceBursts(list, 600);
		expect(list[0].start).toBe(500);
	});

	it("drops a burst once its lifetime is up, and keeps the rest in order", () => {
		let list = withBurst([], ring(0));
		advanceBursts(list, 0);
		list = withBurst(list, ring(1));
		list = withBurst(list, ring(2));
		advanceBursts(list, 400);
		expect(advanceBursts(list, BURST_LIFETIME_MS - 1)).toBe(list);
		const next = advanceBursts(list, BURST_LIFETIME_MS);
		expect(next.map((b) => b.id)).toEqual([1, 2]);
		expect(advanceBursts(next, 400 + BURST_LIFETIME_MS)).toEqual([]);
	});
});
