import { useCallback, useEffect, useRef, useState } from "react";
import { useSharedValue } from "react-native-reanimated";
import type { GameAudio } from "../../application/GameAudio";
import type { GameStore } from "../../application/GameStore";
import { createSceneBuilder } from "../../application/renderScene";
import { GameEngine } from "../../domain/engine/GameEngine";
import type { ScreenSize } from "../../domain/types";
import { FrameClock } from "../../infrastructure/FrameClock";

const DEFAULT_SCREEN: ScreenSize = { width: 400, height: 800 };
const DEFAULT_DENSITY = 400;

/**
 * The engine and the frame clock that drives it. The engine is created on first use at the
 * last laid-out screen size; every rendered frame writes the drawable scene to `scene`, which
 * the canvas draws on the UI thread without a React render.
 */
export function useGameLoop(store: GameStore, audio: GameAudio) {
	const scene = useSharedValue<Float32Array>(new Float32Array(0));
	const [buildScene] = useState(createSceneBuilder);
	const engineRef = useRef<GameEngine | null>(null);
	const clockRef = useRef<FrameClock | null>(null);
	const screenRef = useRef<ScreenSize>(DEFAULT_SCREEN);

	const getEngine = useCallback((): GameEngine => {
		if (!engineRef.current) {
			engineRef.current = new GameEngine({
				density: DEFAULT_DENSITY,
				screen: screenRef.current,
				audio,
			});
		}
		return engineRef.current;
	}, [audio]);

	/** The engine if it exists yet, for input that should not create it */
	const peekEngine = useCallback((): GameEngine | null => engineRef.current, []);

	const setScreen = useCallback((size: ScreenSize) => {
		screenRef.current = size;
		engineRef.current?.setScreen(size);
	}, []);

	/** Write the drawable scene for this rendered frame (alpha = fraction of a tick elapsed) */
	const drawScene = useCallback(
		(alpha: number) => {
			scene.set(buildScene(store.getState().frame, alpha, getEngine().getPlayerPosition()));
		},
		[store, getEngine, scene, buildScene],
	);

	const startClock = useCallback(() => {
		if (clockRef.current) clockRef.current.stop();
		const engine = getEngine();
		clockRef.current = new FrameClock(
			() => {
				engine.tick();
				store.getState().updateFrame(engine.getFrame());
			},
			(dtMs, alpha) => {
				// Player moves and collides every rendered frame; other dots are extrapolated
				// between ticks. Drawn on the UI thread from the shared value -- no React render
				// per frame unless a collision changed score/phase.
				if (engine.advancePlayer(dtMs, alpha)) {
					store.getState().updateFrame(engine.getFrame());
				}
				drawScene(alpha);
			},
		);
		clockRef.current.start();
	}, [store, getEngine, drawScene]);

	const stopClock = useCallback(() => {
		clockRef.current?.stop();
	}, []);

	useEffect(() => () => clockRef.current?.stop(), []);

	return { scene, getEngine, peekEngine, setScreen, drawScene, startClock, stopClock };
}
