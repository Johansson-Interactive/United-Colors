import { Blur, Canvas, Fill, Group, Paint } from "@shopify/react-native-skia";
import type React from "react";
import { StyleSheet } from "react-native";
import type { StageScene } from "../hooks/useStageScene";
import { INK } from "../theme/theme";
import { FROST_MAX_DIM, FROST_MAX_SIGMA, Room, SceneLayers } from "./StageScene";

/** The pause world's frost: the frozen scene blurred and dimmed in full */
const FROST = (
	<Paint>
		<Blur blur={FROST_MAX_SIGMA} />
	</Paint>
);

interface PauseWorldProps {
	stage: StageScene;
}

/**
 * The pause world (see GLOSSARY.md: Portal): the frozen field, frosted, under the pause's
 * content and the play side (see GameCanvas). It is drawn from the frozen frame's own pictures,
 * which stand still while the run is frozen, so it is drawn as it mounts and then left alone:
 * in effect a snapshot, with nothing read back from the screen. It is only mounted while the run
 * is not in play, so play pays nothing for it. It takes no touch.
 */
export const PauseWorld: React.FC<PauseWorldProps> = ({ stage: { room, layers } }) => (
	<Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
		<Room uniforms={room} />
		<Group layer={FROST}>
			<SceneLayers {...layers} />
		</Group>
		<Fill color={INK} opacity={FROST_MAX_DIM} />
	</Canvas>
);
