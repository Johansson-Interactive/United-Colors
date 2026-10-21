import {
	Circle,
	Line,
	LinearGradient,
	Path,
	RoundedRect,
	Skia,
	vec,
} from "@shopify/react-native-skia";
import type React from "react";
import { useMemo } from "react";
import { WHITE } from "../theme/theme";
import { DotButton, GLOW_PAD, type PressPoint } from "./DotButton";

export type Icon =
	| "pause"
	| "sound-on"
	| "sound-off"
	| "level"
	| "settings"
	| "music"
	| "effects"
	| "speed-slow"
	| "speed-normal"
	| "speed-fast";

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

/** A slider across the dot at height `y`, its knob at `knob` */
const Slider: React.FC<GlyphProps & { y: number; knob: number }> = ({ c, r, color, y, knob }) => (
	<>
		<Line
			p1={vec(c - r * 0.36, y)}
			p2={vec(c + r * 0.36, y)}
			color={color}
			strokeWidth={1.5}
			strokeCap="round"
		/>
		<Circle cx={knob} cy={y} r={r * 0.11} color={color} />
	</>
);

/** Two sliders, their knobs set apart: the settings tucked behind the dot */
const Settings: React.FC<GlyphProps> = (props) => {
	const { c, r } = props;
	return (
		<>
			<Slider {...props} y={c - r * 0.17} knob={c + r * 0.15} />
			<Slider {...props} y={c + r * 0.17} knob={c - r * 0.15} />
		</>
	);
};

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

/** `color` with its alpha taken away, for a trail that fades into the background */
function faded(color: string): Float32Array {
	const rgba = Skia.Color(color);
	return Float32Array.from([rgba[0], rgba[1], rgba[2], 0]);
}

/** A comet: a dot and the trail it leaves, `tail` radii long; a longer trail is a faster dot */
const Comet: React.FC<GlyphProps & { tail: number }> = ({ c, r, color, tail }) => {
	const head = vec(c + r * 0.24, c);
	const end = vec(head.x - r * tail, c);
	const colors = useMemo(() => [color, faded(color)], [color]);
	return (
		<>
			<Line p1={head} p2={end} strokeWidth={r * 0.13} strokeCap="round">
				<LinearGradient start={head} end={end} colors={colors} />
			</Line>
			<Circle cx={head.x} cy={head.y} r={r * 0.17} color={color} />
		</>
	);
};

const SpeedSlow: React.FC<GlyphProps> = (props) => <Comet {...props} tail={0.3} />;
const SpeedNormal: React.FC<GlyphProps> = (props) => <Comet {...props} tail={0.55} />;
const SpeedFast: React.FC<GlyphProps> = (props) => <Comet {...props} tail={0.82} />;

const GLYPHS: Record<Icon, React.FC<GlyphProps>> = {
	pause: Pause,
	"sound-on": SoundOn,
	"sound-off": SoundOff,
	level: Level,
	settings: Settings,
	music: Music,
	effects: Effects,
	"speed-slow": SpeedSlow,
	"speed-normal": SpeedNormal,
	"speed-fast": SpeedFast,
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
