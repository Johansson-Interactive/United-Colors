import { GLYPH_ROWS, GLYPHS, UNKNOWN_GLYPH } from "../../presentation/dotmatrix/glyphs";
import {
	LETTER_GAP,
	LINE_GAP,
	layoutDotMatrix,
	matrixBox,
	matrixSize,
	paletteIndex,
	pitchToFit,
	trioIndex,
} from "../../presentation/dotmatrix/layout";

describe("dot-matrix glyphs", () => {
	it("every glyph has 7 rows of equal width using only # and .", () => {
		for (const [ch, rows] of Object.entries(GLYPHS)) {
			expect(rows, ch).toHaveLength(GLYPH_ROWS);
			const width = rows[0].length;
			for (const row of rows) {
				expect(row.length, `${ch} row width`).toBe(width);
				expect(row, ch).toMatch(/^[#.]+$/);
			}
		}
		expect(UNKNOWN_GLYPH).toHaveLength(GLYPH_ROWS);
	});

	it("covers A-Z and 0-9", () => {
		for (const ch of "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789") {
			expect(GLYPHS[ch], ch).toBeDefined();
		}
	});
});

describe("layoutDotMatrix", () => {
	it("lays out a single glyph on a 5x7 grid", () => {
		const layout = layoutDotMatrix("I");
		expect(layout.cols).toBe(5);
		expect(layout.rows).toBe(GLYPH_ROWS);
		// I: 3 + 5 + 3 dots
		expect(layout.dots).toHaveLength(11);
		expect(layout.dots[0]).toMatchObject({ col: 1, row: 0, charIndex: 0, index: 0 });
	});

	it("adds a one-column gap between letters and upper-cases input", () => {
		const layout = layoutDotMatrix("ll");
		expect(layout.cols).toBe(5 + LETTER_GAP + 5);
		const secondL = layout.dots.filter((d) => d.charIndex === 1);
		expect(Math.min(...secondL.map((d) => d.col))).toBe(5 + LETTER_GAP);
	});

	it("uses narrow glyphs for spaces", () => {
		expect(layoutDotMatrix("I I").cols).toBe(5 + LETTER_GAP + 3 + LETTER_GAP + 5);
	});

	it("centres shorter lines and separates lines by the line gap", () => {
		const layout = layoutDotMatrix("TILTLING\nI");
		expect(layout.rows).toBe(GLYPH_ROWS * 2 + LINE_GAP);
		const secondLine = layout.dots.filter((d) => d.row >= GLYPH_ROWS + LINE_GAP);
		expect(secondLine.length).toBe(11);
		const minCol = Math.min(...secondLine.map((d) => d.col));
		expect(minCol).toBe(Math.floor((layout.cols - 5) / 2) + 1);
	});

	it("renders unknown characters as a box instead of dropping them", () => {
		const layout = layoutDotMatrix("@");
		expect(layout.dots.length).toBe(20);
	});

	it("reports pixel size from the pitch", () => {
		expect(matrixSize(layoutDotMatrix("A"), 10)).toEqual({ width: 50, height: 70 });
	});

	it("assigns a stable colour index in 0..2", () => {
		for (const dot of layoutDotMatrix("TILTLING").dots) {
			const i = trioIndex(dot);
			expect(i).toBeGreaterThanOrEqual(0);
			expect(i).toBeLessThan(3);
			expect(trioIndex(dot)).toBe(i);
		}
	});
});

describe("paletteIndex", () => {
	it("gives every dot of a letter the same colour, cycling the palette letter by letter", () => {
		const dots = layoutDotMatrix("TILTLING").dots;
		for (const dot of dots) {
			expect(paletteIndex(dot, 3, "letter")).toBe(dot.charIndex % 3);
		}
		const firstOf = (c: number) => dots.find((d) => d.charIndex === c);
		const t = firstOf(0);
		const i = firstOf(1);
		if (!t || !i) throw new Error("missing letters");
		expect(paletteIndex(t, 3, "letter")).not.toBe(paletteIndex(i, 3, "letter"));
	});

	it("scatters colours within a letter by dot", () => {
		const t = layoutDotMatrix("T").dots;
		const used = new Set(t.map((d) => paletteIndex(d, 3, "dot")));
		expect(used.size).toBeGreaterThan(1);
		for (const dot of t) expect(paletteIndex(dot, 3, "dot")).toBe(trioIndex(dot));
	});
});

describe("pitchToFit", () => {
	it("keeps the preferred pitch when the text already fits", () => {
		expect(pitchToFit(layoutDotMatrix("PLAY"), 200, 4)).toBe(4);
	});

	it("shrinks the pitch so the text width fits", () => {
		const layout = layoutDotMatrix("AGAIN");
		const pitch = pitchToFit(layout, 80, 4);
		expect(pitch).toBeLessThan(4);
		expect(matrixSize(layout, pitch).width).toBeCloseTo(80);
	});

	it("returns the preferred pitch for empty text", () => {
		expect(pitchToFit(layoutDotMatrix(""), 10, 3)).toBe(3);
	});
});

describe("dot-matrix box", () => {
	it("pads the dots on every side, more for glow and parallax", () => {
		const layout = layoutDotMatrix("HI");
		const plain = matrixBox(layout, 6, false, false);
		const lit = matrixBox(layout, 6, true, true);
		expect(plain.width).toBe(matrixSize(layout, 6).width + plain.pad * 2);
		expect(plain.height).toBe(matrixSize(layout, 6).height + plain.pad * 2);
		expect(lit.pad).toBeGreaterThan(plain.pad);
	});
});
