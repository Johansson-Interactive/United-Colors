import { Canvas, Group, Picture, Rect, Shader, Skia } from "@shopify/react-native-skia";
import type React from "react";
import { useState } from "react";
import { StyleSheet } from "react-native";
import { convertToRGBA, type SharedValue, useDerivedValue } from "react-native-reanimated";
import { glareOffset } from "../dotSprites";
import type { PourFrame } from "../hooks/usePour";
import { mergeUniformsByName } from "../mergeShader";
import { recordPicture } from "../recordPicture";
import { drawBursts, drawGlareAt, MERGE_EFFECT } from "../sceneDrawer";
import { COMBO_AMBER, INK } from "../theme/theme";
import { POUR_DIGIT_SCALE, pourBody } from "./pourScene";

interface PourCanvasProps {
	frame: SharedValue<PourFrame>;
	/** Where the drop's centre is on the canvas (px), and the scale the pour is drawn at */
	x: number;
	y: number;
	scale: number;
	/** The tally's dot spacing (px, before scaling) */
	pitch: number;
}

const AMBER = Skia.Color(COMBO_AMBER);
/** The light is still over the game over: the glare sits where an untilted phone puts it */
const GLARE_X = glareOffset(0);
const GLARE_Y = glareOffset(0);

const INK_PAINT = Skia.Paint();
INK_PAINT.setAntiAlias(true);
INK_PAINT.setColor(Skia.Color(INK));
/** A bead's body, and a tally dot outside the drop, in their colour each frame */
const COLOR_PAINT = Skia.Paint();
COLOR_PAINT.setAntiAlias(true);

/**
 * The pour, drawn as the play canvas draws the player taking in a catch (see GameCanvas.tsx):
 * the drop and the catches merging into it as one body under the merge shader, again in amber
 * below the combo bonus's level, so the layer slops with the liquid; then its glare and the
 * tally over it, ink inside the drop and in the drop's colour outside, and the landings' bursts
 * over all, as in play. Catches of another colour are drawn under it. Every frame, on the UI thread, from `frame`.
 */
export const PourCanvas: React.FC<PourCanvasProps> = ({ frame, x, y, scale, pitch }) => {
	const top = -y / scale;
	const transform = [{ translateX: x }, { translateY: y }, { scale }];
	const dotRadius = pitch * POUR_DIGIT_SCALE;

	const body = useDerivedValue(() => {
		const { view, radius, jelly, amber } = frame.get();
		return pourBody({ flights: view.flights, color: view.drop.color, radius, jelly, top, amber });
	});
	const color = useDerivedValue(() => convertToRGBA(frame.get().view.drop.color));
	const uniforms = useDerivedValue(() => mergeUniformsByName(body.get().values, color.get()));
	const amberUniforms = useDerivedValue(() => mergeUniformsByName(body.get().values, AMBER));
	const bodyX = useDerivedValue(() => body.get().x);
	const bodyY = useDerivedValue(() => body.get().y);
	const bodyWidth = useDerivedValue(() => body.get().width);
	const bodyHeight = useDerivedValue(() => body.get().height);
	const amberY = useDerivedValue(() => body.get().amberY);
	const amberHeight = useDerivedValue(() => {
		const b = body.get();
		return Math.max(0, b.y + b.height - b.amberY);
	});

	// Recorded every frame, so each into a recorder kept for the canvas's life (see recordPicture.ts)
	const [underRecorder] = useState(() => Skia.PictureRecorder());
	const [overRecorder] = useState(() => Skia.PictureRecorder());
	const under = useDerivedValue(() =>
		recordPicture(underRecorder, (canvas) => {
			for (const bead of body.get().beads) {
				COLOR_PAINT.setColor(Skia.Color(bead.color));
				canvas.drawCircle(bead.x, bead.y, bead.radius, COLOR_PAINT);
				drawGlareAt(canvas, bead.x, bead.y, bead.radius, GLARE_X, GLARE_Y);
			}
		}),
	);
	const over = useDerivedValue(() =>
		recordPicture(overRecorder, (canvas) => {
			const { view, radius } = frame.get();
			if (radius > 0.5) drawGlareAt(canvas, 0, 0, radius, GLARE_X, GLARE_Y);
			COLOR_PAINT.setColor(Skia.Color(view.drop.color));
			for (const dot of view.digits) {
				canvas.drawCircle(dot.x, dot.y, dotRadius, dot.ink ? INK_PAINT : COLOR_PAINT);
			}
			const { bursts, now } = frame.get();
			drawBursts(canvas, bursts, now);
		}),
	);

	return (
		<Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
			<Group transform={transform}>
				<Picture picture={under} />
				<Rect x={bodyX} y={bodyY} width={bodyWidth} height={bodyHeight}>
					<Shader source={MERGE_EFFECT} uniforms={uniforms} />
				</Rect>
				<Rect x={bodyX} y={amberY} width={bodyWidth} height={amberHeight}>
					<Shader source={MERGE_EFFECT} uniforms={amberUniforms} />
				</Rect>
				<Picture picture={over} />
			</Group>
		</Canvas>
	);
};
