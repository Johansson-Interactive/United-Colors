import type { SkPoint } from "@shopify/react-native-skia";
import { BlurMask, Circle, Group } from "@shopify/react-native-skia";
import type React from "react";
import { type SharedValue, useDerivedValue } from "react-native-reanimated";

interface FrostRimProps {
	/** The frost edge's centre and radius, in stage px */
	centre: SharedValue<SkPoint>;
	radius: SharedValue<number>;
	/** How strongly the rim shows, 0..1 */
	opacity: SharedValue<number>;
	/** The player's colour */
	color: string;
}

const STROKE = 2;
/** The rim's soft glow: a wider, blurred stroke under it */
const GLOW_STROKE = 6;
const GLOW_BLUR = 6;
const GLOW_SHARE = 0.4;

/**
 * The rim on the frost's edge (see frost.ts): a thin stroke in the player's colour over a soft
 * glow, drawn inside a Skia canvas. The bloom and Get ready draw the same rim, so the frost
 * closing over the field and opening from the seat read as one edge going two ways.
 */
export const FrostRim: React.FC<FrostRimProps> = ({ centre, radius, opacity, color }) => {
	const glow = useDerivedValue(() => opacity.get() * GLOW_SHARE);
	return (
		<>
			<Group opacity={glow}>
				<Circle c={centre} r={radius} color={color} style="stroke" strokeWidth={GLOW_STROKE}>
					<BlurMask blur={GLOW_BLUR} style="normal" />
				</Circle>
			</Group>
			<Group opacity={opacity}>
				<Circle c={centre} r={radius} color={color} style="stroke" strokeWidth={STROKE} />
			</Group>
		</>
	);
};
