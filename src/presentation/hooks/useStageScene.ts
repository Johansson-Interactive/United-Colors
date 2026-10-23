import { Skia, type SkPicture } from "@shopify/react-native-skia";
import { useEffect, useMemo, useState } from "react";
import { PixelRatio } from "react-native";
import {
	type SharedValue,
	useAnimatedReaction,
	useDerivedValue,
	useSharedValue,
} from "react-native-reanimated";
import { useStageBox } from "../layout/StageFrame";
import { recordPicture } from "../recordPicture";
import { type RoomUniforms, roomUniforms } from "../room";
import { drawScene, type LiquidBody, liquidBody, wallDrops } from "../sceneDrawer";
import { INK } from "../theme/theme";
import { useTilt } from "../tilt/TiltProvider";
import type { WallDropSlot } from "../wallDropShader";

/** The scene's layers, with the wall drops and the liquid body between them (see SceneLayers) */
export interface SceneLayerValues {
	below: SharedValue<SkPicture>;
	drops: SharedValue<WallDropSlot[]>;
	dropGlares: SharedValue<SkPicture>;
	body: SharedValue<LiquidBody>;
	above: SharedValue<SkPicture>;
}

/** What the stage draws from, the play side and the pause world alike: the light, the wash and the scene */
export interface StageScene {
	/** Where the light the room and the dots are lit from is, by tilt axis */
	lightX: SharedValue<number>;
	lightY: SharedValue<number>;
	/** The edge wash's colour, parsed */
	accentRgb: SharedValue<Float32Array>;
	layers: SceneLayerValues;
}

const INK_RGB = Array.from(Skia.Color(INK));

/**
 * The room and the scene's layers (see room.ts, sceneDrawer.ts), worked out on the UI thread
 * every frame from the `scene` shared value with no React reconciliation per frame: recorded
 * pictures, with the wall drops and the liquid body as shader nodes between them. The light the
 * room and the dots are lit from follows the device tilt, and stands still while the run is
 * `frozen` under the pause world or the play side is frosted. The play side and the pause world
 * both draw from these, so the frozen frame is recorded once for both. It reads no stage box,
 * so it can run above the stage frame (see useRoomUniforms for what needs it).
 */
export function useStageScene(
	scene: SharedValue<Float32Array>,
	accent: SharedValue<string>,
	frost: SharedValue<number>,
	frozen: boolean,
): StageScene {
	const tilt = useTilt();
	const lightX = useSharedValue(0);
	const lightY = useSharedValue(0);
	const still = useSharedValue(frozen);
	useEffect(() => still.set(frozen), [still, frozen]);

	// Only track the light while live: frozen or frosted scenes stay still even as the phone moves
	useAnimatedReaction(
		() => ({
			x: tilt.x.get(),
			y: tilt.y.get(),
			still: still.get() || frost.get() > 0.001,
		}),
		(current) => {
			if (current.still) return;
			lightX.set(current.x);
			lightY.set(current.y);
		},
	);

	// The accent is parsed only when it changes, not with the light every frame
	const accentRgb = useDerivedValue(() => Skia.Color(accent.get()));

	// Each layer is recorded every frame and so into the same recorder each time (see recordPicture.ts)
	const [belowRecorder] = useState(() => Skia.PictureRecorder());
	const [dropsRecorder] = useState(() => Skia.PictureRecorder());
	const [aboveRecorder] = useState(() => Skia.PictureRecorder());
	const below = useDerivedValue(() =>
		recordPicture(belowRecorder, (canvas) =>
			drawScene(canvas, scene.get(), lightX.get(), lightY.get(), "below"),
		),
	);
	const dropGlares = useDerivedValue(() =>
		recordPicture(dropsRecorder, (canvas) =>
			drawScene(canvas, scene.get(), lightX.get(), lightY.get(), "drops"),
		),
	);
	const above = useDerivedValue(() =>
		recordPicture(aboveRecorder, (canvas) =>
			drawScene(canvas, scene.get(), lightX.get(), lightY.get(), "above"),
		),
	);
	const drops = useDerivedValue(() => wallDrops(scene.get()));
	const body = useDerivedValue(() => liquidBody(scene.get()));

	return useMemo(
		() => ({ lightX, lightY, accentRgb, layers: { below, drops, dropGlares, body, above } }),
		[lightX, lightY, accentRgb, below, drops, dropGlares, body, above],
	);
}

/**
 * The room shader's uniforms for `stage` (see room.ts): sized to the stage box, so it runs in a
 * canvas inside the stage frame
 */
export function useRoomUniforms({
	lightX,
	lightY,
	accentRgb,
}: StageScene): SharedValue<RoomUniforms> {
	const { width, height } = useStageBox();
	const pixelRatio = PixelRatio.get();
	return useDerivedValue(() =>
		roomUniforms(width, height, lightX.get(), lightY.get(), INK_RGB, accentRgb.get(), pixelRatio),
	);
}
