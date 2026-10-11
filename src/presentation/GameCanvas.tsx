import {
	Blur,
	Canvas,
	createPicture,
	Group,
	Paint,
	Picture,
	Skia,
	TileMode,
	vec,
} from "@shopify/react-native-skia";
import type React from "react";
import { useCallback, useMemo, useState } from "react";
import { type LayoutChangeEvent, PanResponder, StyleSheet, View } from "react-native";
import {
	type SharedValue,
	useAnimatedReaction,
	useDerivedValue,
	useSharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import {
	SCENE_COLOR,
	SCENE_KIND,
	SCENE_KIND_MERGING,
	SCENE_KIND_PLAYER,
	SCENE_KIND_POINT,
	SCENE_KIND_REJECTED,
	SCENE_KIND_SMALL,
	SCENE_MERGE,
	SCENE_RADIUS,
	SCENE_STRETCH_X,
	SCENE_STRETCH_Y,
	SCENE_STRIDE,
	SCENE_X,
	SCENE_Y,
} from "../application/renderScene";
import { GAME_COLORS } from "../domain/constants";
import type { ScreenSize } from "../domain/types";
import { MERGE_SKSL, packMergeUniforms } from "./mergeShader";
import { useTilt } from "./tilt/TiltProvider";

interface GameCanvasProps {
	/** All dots to draw this frame (player last) as flat records, written every frame by the frame clock */
	scene: SharedValue<Float32Array>;
	onLayout: (size: ScreenSize) => void;
	/** 0 = live; 1 = fully frosted (blurred) for pause / game over */
	frost: SharedValue<number>;
	/** When set (e.g. __DEV__), drag gestures report (dx, dy) for player control */
	onDragDelta?: (dx: number, dy: number) => void;
}

/** Glare centre offset and radius relative to a unit-radius dot, when the device is level */
const GLARE_OFFSET = -0.28;
const GLARE_RADIUS = 0.75;
/** How far (unit radii per radian of tilt) the light slides across each dot */
const GLARE_TILT_GAIN = 0.45;
const GLARE_MAX_OFFSET = 0.55;
/** Halo (soft glow behind each non-player dot) size relative to its radius */
const HALO_SCALE = 1.9;
const FROST_MAX_SIGMA = 14;

// Paints and colours are built once on the JS thread and captured by the picture worklet,
// so a frame only sets the fill colour and draws.

/** Body colours, indexed by the scene's colour index (GAME_COLORS order) */
const FILL_COLORS = GAME_COLORS.map((color) => Skia.Color(color));

const FILL_PAINT = Skia.Paint();
FILL_PAINT.setAntiAlias(true);

/**
 * Specular glare centred on the origin in unit-radius space. Instead of moving the shader
 * with the light, the canvas is shifted so the origin sits at the glare centre and the dot
 * is drawn offset by the opposite amount.
 */
const GLARE_PAINT = Skia.Paint();
GLARE_PAINT.setAntiAlias(true);
GLARE_PAINT.setShader(
	Skia.Shader.MakeRadialGradient(
		vec(0, 0),
		GLARE_RADIUS,
		[Skia.Color("rgba(255,255,255,0.55)"), Skia.Color("rgba(255,255,255,0)")],
		null,
		TileMode.Clamp,
	),
);

/**
 * The player and the dots merging into it, drawn as one liquid body by the metaball shader
 * (see mergeShader.ts). Compiled once; the uniforms are rebuilt every frame.
 */
const MERGE_EFFECT = Skia.RuntimeEffect.Make(MERGE_SKSL);
if (!MERGE_EFFECT) throw new Error("merge shader failed to compile");
const MERGE_PAINT = Skia.Paint();
MERGE_PAINT.setAntiAlias(true);

/** Unit-space soft glow per game colour, indexed like FILL_COLORS */
const HALO_PAINTS = FILL_COLORS.map((color) => {
	const paint = Skia.Paint();
	paint.setAntiAlias(true);
	const withAlpha = (alpha: number) => {
		const c = Float32Array.from(color);
		c[3] = alpha;
		return c;
	};
	paint.setShader(
		Skia.Shader.MakeRadialGradient(
			vec(0, 0),
			1,
			[withAlpha(0.5), withAlpha(0.16), withAlpha(0)],
			[0.3, 0.6, 1],
			TileMode.Clamp,
		),
	);
	return paint;
});

/**
 * Skia game canvas. The whole scene is recorded into one Picture on the UI thread every
 * frame from the `scene` shared value, with no React reconciliation per frame.
 *
 * Every dot is drawn as a lit glass bead: a soft halo in its own colour, a solid body and a
 * specular glare whose position follows the device tilt, so the dots read as physical
 * objects under a fixed light. The player dot has no halo, so its edge stays sharp and the
 * gap to other dots is easy to judge. What marks it as the player's is that it alone is
 * liquid: it trails, stretches and sloshes as it moves and ripples gently at rest (see
 * jelly.ts), while every other dot stays rigid glass.
 * Caught dots merge into the player like water droplets: the player and every merging dot
 * are one body under the metaball shader, so a neck forms between them as the dot slides in
 * and the player swells and settles once it has flowed in.
 * A wrong-colour dot the player touches is refused, like a ball hitting a water balloon: it
 * presses a dent into the liquid and is pushed back out, drawn on top of the liquid so it
 * never looks taken in.
 * The canvas is transparent over the ambient background. Lighting freezes while frosted,
 * and the blur layer only exists while frosted, so a live scene pays nothing for it.
 */
export const GameCanvas: React.FC<GameCanvasProps> = ({ scene, onLayout, frost, onDragDelta }) => {
	const tilt = useTilt();
	const lightX = useSharedValue(0);
	const lightY = useSharedValue(0);
	const [frosted, setFrosted] = useState(false);

	// Only track the light while live: frosted scenes stay still even as the phone moves
	useAnimatedReaction(
		() => ({ x: tilt.x.get(), y: tilt.y.get(), frozen: frost.get() > 0.001 }),
		(current, previous) => {
			if (current.frozen !== previous?.frozen) scheduleOnRN(setFrosted, current.frozen);
			if (current.frozen) return;
			lightX.set(current.x);
			lightY.set(current.y);
		},
	);

	const handleLayout = useCallback(
		(event: LayoutChangeEvent) => {
			const { width, height } = event.nativeEvent.layout;
			onLayout({ width, height });
		},
		[onLayout],
	);

	// Use touch position (not cumulative dx/dy) so deltas are correct and no jump-back on gesture resets
	const panResponder = useMemo(() => {
		if (!onDragDelta) return null;
		let lastTouch: { x: number; y: number } | null = null;
		return PanResponder.create({
			onStartShouldSetPanResponder: () => true,
			onMoveShouldSetPanResponder: () => true,
			onPanResponderGrant: (evt) => {
				const { pageX, pageY } = evt.nativeEvent;
				lastTouch = { x: pageX, y: pageY };
			},
			onPanResponderMove: (evt) => {
				const { pageX, pageY } = evt.nativeEvent;
				const prev = lastTouch;
				if (prev === null) return;
				onDragDelta(pageX - prev.x, pageY - prev.y);
				lastTouch = { x: pageX, y: pageY };
			},
			onPanResponderRelease: () => {
				lastTouch = null;
			},
		});
	}, [onDragDelta]);

	const picture = useDerivedValue(() =>
		createPicture((canvas) => {
			// The glare slides across each dot with the light; see GLARE_PAINT for the transform
			const gx = Math.max(
				-GLARE_MAX_OFFSET,
				Math.min(GLARE_MAX_OFFSET, GLARE_OFFSET - lightX.get() * GLARE_TILT_GAIN),
			);
			const gy = Math.max(
				-GLARE_MAX_OFFSET,
				Math.min(GLARE_MAX_OFFSET, GLARE_OFFSET - lightY.get() * GLARE_TILT_GAIN),
			);

			const dots = scene.get();
			const end = dots.length;
			// Halos first so no glow sits on top of a neighbouring body; a merging dot's halo
			// shrinks away as the dot slides into the player
			for (let i = 0; i < end; i += SCENE_STRIDE) {
				const radius = dots[i + SCENE_RADIUS];
				const kind = dots[i + SCENE_KIND];
				if (radius <= 0 || kind === SCENE_KIND_PLAYER) continue;
				const fade = kind === SCENE_KIND_MERGING ? 1 - dots[i + SCENE_MERGE] : 1;
				const scale = radius * HALO_SCALE * fade;
				if (scale <= 0) continue;
				canvas.save();
				canvas.translate(dots[i + SCENE_X], dots[i + SCENE_Y]);
				canvas.scale(scale, scale);
				canvas.drawCircle(0, 0, 1, HALO_PAINTS[dots[i + SCENE_COLOR]]);
				canvas.restore();
			}
			// A glass bead: body and glare
			const drawBead = (i: number) => {
				const radius = dots[i + SCENE_RADIUS];
				const x = dots[i + SCENE_X];
				const y = dots[i + SCENE_Y];
				FILL_PAINT.setColor(FILL_COLORS[dots[i + SCENE_COLOR]]);
				canvas.drawCircle(x, y, radius, FILL_PAINT);
				canvas.save();
				canvas.translate(x + gx * radius, y + gy * radius);
				canvas.scale(radius, radius);
				canvas.drawCircle(-gx, -gy, 1, GLARE_PAINT);
				canvas.restore();
			};
			// Free dots
			for (let i = 0; i < end; i += SCENE_STRIDE) {
				const kind = dots[i + SCENE_KIND];
				if (dots[i + SCENE_RADIUS] <= 0) continue;
				if (kind === SCENE_KIND_SMALL || kind === SCENE_KIND_POINT) drawBead(i);
			}
			// The player and whatever is merging into it, as one liquid body
			const merge = packMergeUniforms(dots);
			if (merge === null) return;
			const playerOffset = end - SCENE_STRIDE;
			const color = FILL_COLORS[dots[playerOffset + SCENE_COLOR]];
			merge.values.push(color[0], color[1], color[2], color[3]);
			MERGE_PAINT.setShader(MERGE_EFFECT.makeShader(merge.values));
			canvas.drawRect(
				Skia.XYWHRect(merge.left, merge.top, merge.right - merge.left, merge.bottom - merge.top),
				MERGE_PAINT,
			);
			// Glare on the liquid: fading on each merging dot, full on the player and stretched
			// with it
			for (let i = 0; i < end; i += SCENE_STRIDE) {
				const radius = dots[i + SCENE_RADIUS];
				const kind = dots[i + SCENE_KIND];
				if (radius <= 0 || (kind !== SCENE_KIND_PLAYER && kind !== SCENE_KIND_MERGING)) continue;
				const x = dots[i + SCENE_X];
				const y = dots[i + SCENE_Y];
				const isPlayer = kind === SCENE_KIND_PLAYER;
				GLARE_PAINT.setAlphaf(isPlayer ? 1 : 1 - dots[i + SCENE_MERGE]);
				canvas.save();
				if (isPlayer) {
					const sx = dots[i + SCENE_STRETCH_X];
					const sy = dots[i + SCENE_STRETCH_Y];
					const k = 1 + Math.hypot(sx, sy);
					const degrees = (Math.atan2(sy, sx) * 180) / Math.PI;
					canvas.translate(x, y);
					canvas.rotate(degrees, 0, 0);
					canvas.scale(k, 1 / k);
					canvas.rotate(-degrees, 0, 0);
					canvas.translate(-x, -y);
				}
				canvas.translate(x + gx * radius, y + gy * radius);
				canvas.scale(radius, radius);
				canvas.drawCircle(-gx, -gy, 1, GLARE_PAINT);
				canvas.restore();
			}
			GLARE_PAINT.setAlphaf(1);
			// A refused dot sits on top, in the dent it presses into the liquid
			for (let i = 0; i < end; i += SCENE_STRIDE) {
				if (dots[i + SCENE_KIND] === SCENE_KIND_REJECTED && dots[i + SCENE_RADIUS] > 0) {
					drawBead(i);
				}
			}
		}),
	);

	const frostSigma = useDerivedValue(() => frost.get() * FROST_MAX_SIGMA);

	// When using drag, Canvas must not capture touches so the container gets them
	const canvasPointerEvents = onDragDelta ? "none" : "auto";

	return (
		<View style={styles.container} onLayout={handleLayout} {...(panResponder?.panHandlers ?? {})}>
			<Canvas style={StyleSheet.absoluteFill} pointerEvents={canvasPointerEvents}>
				{frosted ? (
					<Group
						layer={
							<Paint>
								<Blur blur={frostSigma} />
							</Paint>
						}
					>
						<Picture picture={picture} />
					</Group>
				) : (
					<Picture picture={picture} />
				)}
			</Canvas>
		</View>
	);
};

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: "transparent",
	},
});
