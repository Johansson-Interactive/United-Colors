import { useEffect } from "react";
import { type SharedValue, useSharedValue } from "react-native-reanimated";
import type { GameSession } from "../../application/GameSession";

/**
 * The drawable scene the session produces every rendered frame, as a shared value the canvas
 * draws from on the UI thread without a React render. The session stops ticking when the
 * screen goes.
 */
export function useSessionScene(session: GameSession): SharedValue<Float32Array> {
	const scene = useSharedValue<Float32Array>(new Float32Array(0));
	useEffect(() => session.present((next) => scene.set(next)), [session, scene]);
	useEffect(() => () => session.halt(), [session]);
	return scene;
}
