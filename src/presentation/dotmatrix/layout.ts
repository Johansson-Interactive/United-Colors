import { GLYPH_ROWS, GLYPHS, UNKNOWN_GLYPH } from "./glyphs";

/** One dot of laid-out text, in cell units (multiply by the pitch to get pixels) */
export interface MatrixDot {
	/** Column and row in the text grid, 0-based from the top-left */
	col: number;
	row: number;
	/** Index of the character this dot belongs to (spaces included) */
	charIndex: number;
	/** Running index of the dot within the whole text */
	index: number;
}

export interface MatrixLayout {
	dots: MatrixDot[];
	/** Size in cells (columns / rows), including inter-letter gaps and line gaps */
	cols: number;
	rows: number;
}

/** Columns left empty between letters and rows left empty between lines */
export const LETTER_GAP = 1;
export const LINE_GAP = 2;

/**
 * Lay out dot-matrix text in grid units. Lines are separated by `\n`, each centred on the
 * widest line. Unknown characters render as a box. Lower-case is upper-cased.
 */
export function layoutDotMatrix(text: string): MatrixLayout {
	const lines = text.toUpperCase().split("\n");
	const lineGlyphs = lines.map((line) => Array.from(line).map((ch) => GLYPHS[ch] ?? UNKNOWN_GLYPH));
	const lineWidths = lineGlyphs.map((glyphs) =>
		glyphs.reduce((w, g, i) => w + g[0].length + (i > 0 ? LETTER_GAP : 0), 0),
	);
	const cols = Math.max(0, ...lineWidths);
	const rows = lines.length * GLYPH_ROWS + (lines.length - 1) * LINE_GAP;

	const dots: MatrixDot[] = [];
	let index = 0;
	let charIndex = 0;
	lineGlyphs.forEach((glyphs, lineIndex) => {
		const rowOffset = lineIndex * (GLYPH_ROWS + LINE_GAP);
		let colOffset = Math.floor((cols - lineWidths[lineIndex]) / 2);
		for (const glyph of glyphs) {
			for (let row = 0; row < GLYPH_ROWS; row++) {
				const line = glyph[row];
				for (let col = 0; col < line.length; col++) {
					if (line[col] !== "#") continue;
					dots.push({ col: colOffset + col, row: rowOffset + row, charIndex, index: index++ });
				}
			}
			colOffset += glyph[0].length + LETTER_GAP;
			charIndex++;
		}
		charIndex++; // the newline
	});

	return { dots, cols, rows };
}

/** Pixel size of a layout at a given pitch (centre-to-centre dot spacing) */
export function matrixSize(layout: MatrixLayout, pitch: number): { width: number; height: number } {
	return { width: layout.cols * pitch, height: layout.rows * pitch };
}

/** A glowing text's glow: its radius relative to the dot's, and its alpha at the centre */
export const GLOW_SCALE = 2.6;
export const GLOW_CORE_ALPHA = 0.35;

/** Pixels of parallax drift per radian of tilt for the deepest layer */
export const PARALLAX_GAIN = 26;

/**
 * The canvas a text needs at a given pitch: its dots plus a margin on every side for glow and
 * parallax drift, so nothing clips at the edge. `pad` is that margin.
 */
export function matrixBox(
	layout: MatrixLayout,
	pitch: number,
	glow: boolean,
	parallax: boolean,
): { width: number; height: number; pad: number } {
	const base = matrixSize(layout, pitch);
	const pad = Math.ceil((parallax ? PARALLAX_GAIN * 0.8 : 0) + pitch * (glow ? 1.2 : 0.5));
	return { width: base.width + pad * 2, height: base.height + pad * 2, pad };
}

/** Deterministic colour index for a dot so multi-colour text is stable across renders */
export function trioIndex(dot: MatrixDot): number {
	return (dot.col * 7 + dot.row * 3 + dot.charIndex) % 3;
}

/** How a palette is spread over text: scattered per dot, or one colour per letter */
export type ColorBy = "dot" | "letter";

/** Palette index for a dot: a stable scatter, or its letter's place in the text */
export function paletteIndex(dot: MatrixDot, size: number, by: ColorBy): number {
	return (by === "letter" ? dot.charIndex : trioIndex(dot)) % size;
}

/** Largest pitch, up to `maxPitch`, at which the layout's width fits within `maxWidth` */
export function pitchToFit(layout: MatrixLayout, maxWidth: number, maxPitch: number): number {
	if (layout.cols === 0) return maxPitch;
	return Math.min(maxPitch, maxWidth / layout.cols);
}
