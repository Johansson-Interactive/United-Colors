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
