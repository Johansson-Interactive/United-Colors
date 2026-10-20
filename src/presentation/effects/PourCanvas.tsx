import {
	Canvas,
	Group,
	Picture,
	Rect,
	Shader,
	type SkColor,
	Skia,
} from "@shopify/react-native-skia";
import type React from "react";
import { useState } from "react";
import { StyleSheet } from "react-native";
import { convertToRGBA, type SharedValue, useDerivedValue } from "react-native-reanimated";
import { glareOffset } from "../dotSprites";
import { mergeUniformsByName } from "../mergeShader";
import { recordPicture } from "../recordPicture";
import { drawGlareAt, MERGE_EFFECT } from "../sceneDrawer";
import { COMBO_AMBER, INK, TRIO } from "../theme/theme";
import { useTilt } from "../tilt/TiltProvider";
import { POUR_DIGIT_SCALE, type PourFrame, pourBody } from "./pourScene";

interface PourCanvasProps {
	frame: SharedValue<PourFrame>;
	/** Where the drop's centre is on the canvas (px), and the scale the pour is drawn at */
	x: number;
	y: number;
	scale: number;
}

const AMBER = Skia.Color(COMBO_AMBER);
/**
 * Every colour the pour draws in, parsed once: the game's, as its catches and the drop have,
 * and combo amber, as the bonus body has; as Skia colours for the paints and as RGBA for the
 * merge shader
 */
const POUR_COLORS = [...TRIO, COMBO_AMBER];
const FILLS: Record<string, SkColor> = {};
const RGBA: Record<string, number[]> = {};
for (const c of POUR_COLORS) {
	FILLS[c] = Skia.Color(c);
	RGBA[c] = convertToRGBA(c);
}
const INK_PAINT = Skia.Paint();
INK_PAINT.setAntiAlias(true);
INK_PAINT.setColor(Skia.Color(INK));
/** The `+N` in the amber, in ink as it fades in */
const BONUS_PAINT = Skia.Paint();
BONUS_PAINT.setAntiAlias(true);
BONUS_PAINT.setColor(Skia.Color(INK));
/** A bead's body, and a tally dot outside the drop, in their colour each frame */
const COLOR_PAINT = Skia.Paint();
COLOR_PAINT.setAntiAlias(true);

/**
 * The pour, drawn as the play canvas draws the player taking in a catch (see GameCanvas.tsx):
 * catches of another colour; then the drop and the catches merging into it as one body under
 * the merge shader, amber under its wavy surface; then the glare, the tally and `+N` over it.
 * Every frame, on the UI thread, from `frame`.
 */
export const PourCanvas: React.FC<PourCanvasProps> = ({ frame, x, y, scale }) => {
	const top = -y / scale;
	const transform = [{ translateX: x }, { translateY: y }, { scale }];
	// The glare follows the tilt, as on the AGAIN button's drop and the dots in play
	const tilt = useTilt();
	const glare = useDerivedValue(() => ({
		x: glareOffset(tilt.x.get()),
		y: glareOffset(tilt.y.get()),
	}));

	const body = useDerivedValue(() => {
		const { view, radius, jelly } = frame.get();
		const { flights, drop, amberLevel } = view;
		return pourBody({ flights, color: drop.color, radius, jelly, top, amberLevel, scale });
	});
	const color = useDerivedValue(() => RGBA[frame.get().view.drop.color]);
	const uniforms = useDerivedValue(() => {
		const { values, amber } = body.get();
		return mergeUniformsByName(values, color.get(), amber, AMBER);
	});
	const bodyX = useDerivedValue(() => body.get().x);
	const bodyY = useDerivedValue(() => body.get().y);
	const bodyWidth = useDerivedValue(() => body.get().width);
	const bodyHeight = useDerivedValue(() => body.get().height);

	// Recorded every frame, so each into a recorder kept for the canvas's life (see recordPicture.ts)
	const [underRecorder] = useState(() => Skia.PictureRecorder());
	const [overRecorder] = useState(() => Skia.PictureRecorder());
	const under = useDerivedValue(() =>
		recordPicture(underRecorder, (canvas) => {
			const { x: gx, y: gy } = glare.get();
			for (const bead of body.get().beads) {
				COLOR_PAINT.setColor(FILLS[bead.color]);
				canvas.drawCircle(bead.x, bead.y, bead.radius, COLOR_PAINT);
				drawGlareAt(canvas, bead.x, bead.y, bead.radius, gx, gy);
			}
		}),
	);
	const over = useDerivedValue(() =>
		recordPicture(overRecorder, (canvas) => {
			const { view, radius } = frame.get();
			const { x: gx, y: gy } = glare.get();
			if (radius > 0.5) drawGlareAt(canvas, 0, 0, radius, gx, gy);
			COLOR_PAINT.setColor(FILLS[view.drop.color]);
			const dotRadius = view.tallyPitch * POUR_DIGIT_SCALE;
			for (const dot of view.digits) {
				canvas.drawCircle(dot.x, dot.y, dotRadius, dot.ink ? INK_PAINT : COLOR_PAINT);
			}
			const { bonusLabel: label } = view;
			if (label !== null && label.opacity > 0) {
				BONUS_PAINT.setAlphaf(label.opacity);
				const labelRadius = label.pitch * POUR_DIGIT_SCALE;
				for (const dot of label.dots) canvas.drawCircle(dot.x, dot.y, labelRadius, BONUS_PAINT);
			}
		}),
	);

	return (
		<Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
			<Group transform={transform}>
				<Picture picture={under} />
				<Rect x={bodyX} y={bodyY} width={bodyWidth} height={bodyHeight}>
					<Shader source={MERGE_EFFECT} uniforms={uniforms} />
				</Rect>
				<Picture picture={over} />
			</Group>
		</Canvas>
	);
};
