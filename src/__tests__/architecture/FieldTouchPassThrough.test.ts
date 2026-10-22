/// <reference types="vite/client" />

/**
 * The field is the way into and out of the pause (see FieldTouch, GLOSSARY.md: Bloom, Get
 * ready): one touch layer over the game canvas, under everything else. Whatever is mounted
 * over it must let a touch clear of its buttons fall through, or the field never sees one and
 * the pause screen cannot be left except by QUIT. A React Native view with no pointerEvents
 * swallows the touch for its whole area, so every layer over the field that fills the stage,
 * and every one's root, must declare "none" or "box-none". Components are not rendered in
 * these tests, so this reads the source, as the layers test does.
 */

/** The layers mounted over the field while it is the touch surface: play, the pause and Get ready */
const OVER_THE_FIELD = [
	"presentation/components/HUD.tsx",
	"presentation/components/PausedScore.tsx",
	"presentation/overlays/FrostBloomOverlay.tsx",
	"presentation/overlays/GetReadyOverlay.tsx",
	"presentation/overlays/PauseOverlay.tsx",
];

/** The elements that take up room and can swallow a touch */
const CONTAINERS = ["View", "Animated.View", "Canvas"];

const SOURCES = Object.fromEntries(
	Object.entries(
		import.meta.glob(["../../presentation/**/*.tsx"], {
			query: "?raw",
			import: "default",
			eager: true,
		}) as Record<string, string>,
	).map(([key, source]) => [key.replace(/^\.\.\/\.\.\//, ""), source]),
);

/** The names in the file's StyleSheet whose style fills the stage */
function fillingStyles(source: string): string[] {
	return [...source.matchAll(/(\w+):\s*\{[^}]*StyleSheet\.absoluteFill/g)].map((m) => m[1]);
}

/**
 * The text of every opening tag of a container in `source`, from `<` to its `>`, with braces
 * tracked so a `>` inside a prop's expression doesn't end it early
 */
function openingTags(source: string): string[] {
	const tags: string[] = [];
	const starts = new RegExp(`<(${CONTAINERS.map((c) => c.replace(".", "\\.")).join("|")})\\b`, "g");
	for (const match of source.matchAll(starts)) {
		let depth = 0;
		for (let i = match.index + match[0].length; i < source.length; i++) {
			const ch = source[i];
			if (ch === "{") depth++;
			else if (ch === "}") depth--;
			else if (ch === ">" && depth === 0) {
				tags.push(source.slice(match.index, i + 1));
				break;
			}
		}
	}
	return tags;
}

/** The element the component returns: the first tag after its `return (` */
function rootTag(source: string, tags: string[]): string | undefined {
	const at = source.indexOf("return (");
	return tags.find((tag) => source.indexOf(tag) > at);
}

const fillsTheStage = (tag: string, styles: string[]) =>
	/StyleSheet\.absoluteFill/.test(tag) ||
	styles.some((s) => new RegExp(`styles\\.${s}\\b`).test(tag));

const letsTouchesThrough = (tag: string) => /pointerEvents=\{?["'](none|box-none)["']\}?/.test(tag);

describe("the layers over the field", () => {
	it.each(OVER_THE_FIELD)(
		"%s lets a touch clear of its buttons fall through to the field",
		(file) => {
			const source = SOURCES[file];
			expect(source, `${file} exists`).toBeDefined();
			const tags = openingTags(source);
			const styles = fillingStyles(source);
			const root = rootTag(source, tags);
			expect(root, `${file} has a root container`).toBeDefined();
			const swallowing = tags.filter(
				(tag) => (tag === root || fillsTheStage(tag, styles)) && !letsTouchesThrough(tag),
			);
			expect(swallowing).toEqual([]);
		},
	);
});

describe("the field's touch layer", () => {
	// Filling the stage would take the grip band back: its frame is FIELD_TOUCH_FRAME
	it("does not fill the stage", () => {
		const source = SOURCES["presentation/components/FieldTouch.tsx"];
		expect(source).toBeDefined();
		expect(source).not.toMatch(/StyleSheet\.absoluteFill/);
	});
});
