type FloodStage = "idle" | "covering" | "covered" | "lifting";

export interface FloodEffects {
	/** Grow the dot until it covers the screen; report back with `covered` */
	cover: () => void;
	/** Fade the dot away; report back with `lifted` */
	lift: () => void;
}

export interface FloodSequence {
	readonly stage: FloodStage;
	/** Cover the screen, run `onCovered` to change the scene, and lift once that scene has rendered */
	run: (onCovered: () => void) => void;
	/** The dot covers the screen */
	covered: () => void;
	/** The scene changed under the dot has been rendered */
	sceneRendered: () => void;
	/** The dot has faded away */
	lifted: () => void;
}

/**
 * Tally of consecutive frames drawn at a steady rate. A frame longer than `maxFrameMs` means
 * the UI thread stalled (the title screen's first draw, say), which resets the tally: a
 * timed animation started before a stall jumps to its end when frames resume.
 */
export function tallySmoothFrames(tally: number, frameMs: number, maxFrameMs: number): number {
	"worklet";
	return frameMs > 0 && frameMs <= maxFrameMs ? tally + 1 : 0;
}

/**
 * Orders a flood transition. The lift waits for the scene change to render, not for a
 * timer: mounting a new screen can take longer than the cover animation, and lifting
 * early would show the old screen fading out underneath.
 */
export function createFloodSequence(effects: FloodEffects): FloodSequence {
	let stage: FloodStage = "idle";
	let pending: (() => void) | null = null;
	return {
		get stage() {
			return stage;
		},
		run(onCovered) {
			stage = "covering";
			pending = onCovered;
			effects.cover();
		},
		covered() {
			if (stage !== "covering") return;
			stage = "covered";
			const onCovered = pending;
			pending = null;
			onCovered?.();
		},
		sceneRendered() {
			if (stage !== "covered") return;
			stage = "lifting";
			effects.lift();
		},
		lifted() {
			if (stage === "lifting") stage = "idle";
		},
	};
}
