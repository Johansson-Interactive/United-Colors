import { Circle, Line, Path, RoundedRect, Skia, vec } from "@shopify/react-native-skia";
import type React from "react";
import { useMemo } from "react";
import { WHITE } from "../theme/theme";
import { DotButton, GLOW_PAD, type PressPoint } from "./DotButton";

type Icon = "pause" | "sound-on" | "sound-off" | "level" | "music" | "effects";

interface IconDotProps {
	size: number;
	onPress: (point: PressPoint) => void;
	icon: Icon;
	accessibilityLabel: string;
	color?: string;
	/** Draw a slash through the glyph (a switched-off setting) */
	struck?: boolean;
}

/** A glyph drawn around centre `c` at dot radius `r` */
interface GlyphProps {
	c: number;
	r: number;
	color: string;
}

const Level: React.FC<GlyphProps> = ({ c, r, color }) => (
	<>
		<Circle cx={c} cy={c} r={r * 0.46} color={color} style="stroke" strokeWidth={1.5} />
		<Circle cx={c} cy={c} r={r * 0.17} color={color} />
	</>
);

const Pause: React.FC<GlyphProps> = ({ c, r, color }) => (
	<>
		<RoundedRect
			x={c - r * 0.3}
			y={c - r * 0.32}
			width={r * 0.2}
			height={r * 0.64}
			r={r * 0.1}
			color={color}
		/>
		<RoundedRect
			x={c + r * 0.1}
			y={c - r * 0.32}
			width={r * 0.2}
			height={r * 0.64}
			r={r * 0.1}
			color={color}
		/>
	</>
);

const SoundOn: React.FC<GlyphProps> = ({ c, r, color }) => {
	const waves = useMemo(() => {
		const r1 = r * 0.34;
		const r2 = r * 0.55;
		return Skia.PathBuilder.Make()
			.addArc(Skia.XYWHRect(c - r1 - r * 0.1, c - r1, r1 * 2, r1 * 2), -40, 80)
			.addArc(Skia.XYWHRect(c - r2 - r * 0.1, c - r2, r2 * 2, r2 * 2), -40, 80)
			.detach();
	}, [c, r]);
	return (
		<>
			<Circle cx={c - r * 0.22} cy={c} r={r * 0.16} color={color} />
			<Path path={waves} color={color} style="stroke" strokeWidth={2} strokeCap="round" />
		</>
	);
};

const SoundOff: React.FC<GlyphProps> = ({ c, r, color }) => (
	<>
		<Circle cx={c - r * 0.22} cy={c} r={r * 0.16} color={color} />
		<Line
			p1={vec(c + r * 0.05, c - r * 0.3)}
			p2={vec(c + r * 0.5, c + r * 0.3)}
			color={color}
			strokeWidth={2}
			strokeCap="round"
		/>
	</>
);

/** A quaver: dot head, stem and a curled flag */
const Music: React.FC<GlyphProps> = ({ c, r, color }) => {
	const stem = useMemo(() => {
		const x = c + r * 0.06;
		return Skia.PathBuilder.Make()
			.moveTo(x, c + r * 0.2)
			.lineTo(x, c - r * 0.34)
			.quadTo(x + r * 0.06, c - r * 0.12, x + r * 0.26, c - r * 0.06)
			.detach();
	}, [c, r]);
	return (
		<>
			<Circle cx={c - r * 0.08} cy={c + r * 0.2} r={r * 0.15} color={color} />
			<Path path={stem} color={color} style="stroke" strokeWidth={2} strokeCap="round" />
		</>
	);
};

/** The game's own sounds: a dot with two smaller ones it is about to catch */
const Effects: React.FC<GlyphProps> = ({ c, r, color }) => (
	<>
		<Circle cx={c - r * 0.12} cy={c + r * 0.08} r={r * 0.2} color={color} />
		<Circle cx={c + r * 0.22} cy={c - r * 0.2} r={r * 0.1} color={color} />
		<Circle cx={c + r * 0.3} cy={c + r * 0.16} r={r * 0.06} color={color} />
	</>
);

const GLYPHS: Record<Icon, React.FC<GlyphProps>> = {
	pause: Pause,
	"sound-on": SoundOn,
	"sound-off": SoundOff,
	level: Level,
	music: Music,
	effects: Effects,
};

/** Secondary controls: a ghost dot carrying a small glyph drawn in Skia */
export const IconDot: React.FC<IconDotProps> = ({
	size,
	onPress,
	icon,
	accessibilityLabel,
	color = WHITE,
	struck = false,
}) => {
	const radius = size / 2;
	// Canvas inside DotButton is padded by GLOW_PAD radii on each side
	const c = radius + radius * GLOW_PAD;
	const Glyph = GLYPHS[icon];

	return (
		<DotButton
			size={size}
			color={color}
			variant="ghost"
			onPress={onPress}
			accessibilityLabel={accessibilityLabel}
		>
			<Glyph c={c} r={radius} color={color} />
			{struck ? (
				<Line
					p1={vec(c - radius * 0.42, c - radius * 0.42)}
					p2={vec(c + radius * 0.42, c + radius * 0.42)}
					color={color}
					strokeWidth={2}
					strokeCap="round"
				/>
			) : null}
		</DotButton>
	);
};
