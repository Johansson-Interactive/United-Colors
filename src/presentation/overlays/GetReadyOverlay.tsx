import {
	BlurMask,
	Canvas,
	Circle,
	Group,
	Rect,
	Shader,
	Skia,
	vec,
} from "@shopify/react-native-skia";
import type React from "react";
import { useEffect, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
	FadeIn,
	FadeOut,
	type SharedValue,
	useAnimatedStyle,
	useDerivedValue,
	useFrameCallback,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { playerDisc } from "../../application/sceneRecord";
import { cornerExtent } from "../../domain/arena";
import type { Corners } from "../../domain/types";
import { DotMatrixText } from "../components/DotMatrixText";
import { FrostRim } from "../components/FrostRim";
import { layoutDotMatrix, pitchToFit } from "../dotmatrix/layout";
import { FROSTED_ALL, type FrostEdge } from "../effects/frost";
import { SCORE_CENTRE_Y, SCORE_PITCH } from "../effects/scoreTally";
import { useStageBox } from "../layout/StageFrame";
import { LIQUID_WOBBLE } from "../liquidShader";
import { WALL_DROP_EFFECT } from "../sceneDrawer";
import { glass, INK, shade } from "../theme/theme";
import {
	advanceGetReady,
	closeGetReady,
	type GetReadyFrame,
	NO_SEAT,
	OPEN_GET_READY,
} from "../tilt/getReady";
import { useTilt } from "../tilt/TiltProvider";
import type { FieldTouchState } from "../touch/fieldTouch";
import { wallDropUniformsByName } from "../wallDropShader";

interface GetReadyOverlayProps {
	/** The frozen scene, for where the player dot froze (the seat) and how big it is */
	scene: SharedValue<Float32Array>;
	/** The player's colour: the rolling dot, the rim and the caption wear it */
	color: string;
	/** The rolling dot moves this many times its usual distance per tilt, like the player dot */
	sensitivity: number;
	/** How the stage's corners are rounded, so the dot rolls round them (null: square) */
	corners: Corners | null;
	/** Whether the finger on the frost is still down, as the field touch layer keeps it; lifted, the cup shuts */
	touch: SharedValue<FieldTouchState>;
	/** The frost's edge, which this keeps as the window and widens with the hold */
	frostEdge: SharedValue<FrostEdge>;
	/** Fired once, the moment the thaw clears the field */
	onReady: () => void;
	/** Fired once, when the window has shut after the finger lifted */
	onShut: () => void;
}

const CAPTION = "ROLL IT HOME";
/** The caption's pitch where it fits, the same as the PAUSED it stands in for */
const CAPTION_PITCH = 8;
/** Room the caption keeps from the stage's sides */
const CAPTION_MARGIN = 48;
/** The caption's top: below the score waiting at the HUD's spot (see scoreSink.ts), with room */
const CAPTION_TOP = SCORE_CENTRE_Y + SCORE_PITCH * 3.5 + 16;
const CAPTION_FADE_MS = 250;
/** The glare on the rolling dot, as fractions of its radius; the light is frozen with the field */
const GLARE_OFFSET = -0.28;
const GLARE_RADIUS = 0.4;
/** The shade the rolling dot casts once off the seat, and how far it trails downhill */
const SHADE_MAX = 0.35;
const SHADE_FULL_AT = 40;
const SHADE_TRAIL = 8;

/** Before the first frame is stepped nothing is drawn; the overlay is still fading in */
const BEFORE_FIRST_FRAME: GetReadyFrame = {
	drawn: false,
	seat: NO_SEAT,
	dot: { x: 0, y: 0 },
	body: { x: 0, y: 0, radius: 0, wallX: 0, wallY: 0, wallC: 0, neck: 0 },
	window: FROSTED_ALL,
	rim: 0,
	opened: 0,
	caption: false,
	fired: false,
	shut: false,
};
/** The cover over the frozen player reaches past its ripples (see LIQUID_WOBBLE) and its edge */
const COVER_SCALE = 1 + LIQUID_WOBBLE;
const COVER_MARGIN = 0.5;

/**
 * Get ready: the field stays frosted from the pause, and the cup opens in it at the seat, where
 * the player dot froze: the title's bowl, a clear circle in the frost with no glass over it,
 * and the rim on its edge pulsing in the player's colour like a point dot. A solid copy of the dot rolls
 * around inside it with the tilt, with a little weight to it, and presses into a wall as the
 * player does in play. Rolling it home and holding level
 * thaws the frost outward from the cup, and the moment the field is clear play resumes; the
 * window is left open, so the frost lifts behind it unseen. Lift the finger first and the cup
 * shuts, and Get ready is over. One caption says what to do; it fades while the player holds
 * and comes back when the hold breaks. Touches go through to the field touch layer. The paused
 * score waits dimmed at the top (see PausedScore), so the caption sits under it.
 *
 * The rules live in the get-ready stepper: each frame, on the UI thread where the tilt and the
 * touch are, this takes one step of it and copies what it says to draw. The window itself is
 * cut by the game canvas, which this drives through `frostEdge`; the seat and the dot are drawn
 * here over it.
 */
export const GetReadyOverlay: React.FC<GetReadyOverlayProps> = ({
	scene,
	color,
	sensitivity,
	corners,
	touch,
	frostEdge,
	onReady,
	onShut,
}) => {
	const tilt = useTilt();
	const { width, height } = useStageBox();
	const field = useMemo(
		() => ({
			width,
			height,
			cornerExtent: cornerExtent({ width, height, corners: corners ?? undefined }),
		}),
		[width, height, corners],
	);
	const state = useSharedValue(OPEN_GET_READY);
	// What the stepper last said to draw
	const frame = useSharedValue(BEFORE_FIRST_FRAME);
	// The caption's opacity, faded on the frame's caption edges
	const caption = useSharedValue(0);

	// The scene is frozen, so the seat is where the player is drawn in it throughout
	const player = useDerivedValue(() => playerDisc(scene.get()));
	// What the stepper last drew on: the seat, or NO_SEAT with nothing drawn
	const seat = useDerivedValue(() => frame.get().seat);

	useFrameCallback((info) => {
		const prev = state.get();
		const { state: next, frame: now } = advanceGetReady(prev, {
			seat: player.get(),
			held: touch.get().down,
			tilt: { x: tilt.x.get(), y: tilt.y.get() },
			dt: info.timeSincePreviousFrame ?? 16,
			field,
			sensitivity,
		});
		// Once fired or shut the stepper answers with the same state, and there is nothing new to copy
		if (next === prev) return;
		state.set(next);
		if (now.caption !== frame.get().caption) {
			caption.set(withTiming(now.caption ? 1 : 0, { duration: CAPTION_FADE_MS }));
		}
		frame.set(now);
		frostEdge.set(now.window);
		if (now.fired) scheduleOnRN(onReady);
		if (now.shut) scheduleOnRN(onShut);
	});

	// Leaves the edge the stepper says on close: the window open once fired, frosted all over otherwise
	useEffect(
		() => () => {
			frostEdge.set(closeGetReady(state.get(), frostEdge.get()));
		},
		[state, frostEdge],
	);

	const shown = useDerivedValue(() => (frame.get().drawn ? 1 : 0));
	// The seat, the dot and its shade show as the cup opens, and go as it shuts
	const opened = useDerivedValue(() => frame.get().opened);
	const seatCentre = useDerivedValue(() => vec(seat.get().x, seat.get().y));
	const seatRadius = useDerivedValue(() => seat.get().radius);
	// The frozen player is stretched along its jelly stretch, so its cover is too (see drawScene)
	const coverRadius = useDerivedValue(() => seat.get().radius * COVER_SCALE + COVER_MARGIN);
	const coverTransform = useDerivedValue(() => {
		const stretchX = player.get()?.stretchX ?? 0;
		const stretchY = player.get()?.stretchY ?? 0;
		const k = 1 + Math.hypot(stretchX, stretchY);
		const angle = Math.atan2(stretchY, stretchX);
		return [{ rotate: angle }, { scaleX: k }, { scaleY: 1 / k }, { rotate: -angle }];
	});
	const windowCentre = useDerivedValue(() => vec(frame.get().window.x, frame.get().window.y));
	const windowRadius = useDerivedValue(() => frame.get().window.radius);
	const rim = useDerivedValue(() => frame.get().rim);

	const shadeCentre = useDerivedValue(() => {
		const { dot } = frame.get();
		return vec(dot.x + tilt.x.get() * SHADE_TRAIL, dot.y + tilt.y.get() * SHADE_TRAIL + 2);
	});
	const shadeOpacity = useDerivedValue(() => {
		const { dot } = frame.get();
		const s = seat.get();
		return SHADE_MAX * Math.min(1, Math.hypot(dot.x - s.x, dot.y - s.y) / SHADE_FULL_AT);
	});
	// The dot's body is the wall drop shader's, so pressed into a wall it is cut off at it and
	// wets it as the player does in play
	const bodyColor = useMemo(() => Array.from(Skia.Color(color)), [color]);
	const bodyRect = useDerivedValue(() => {
		const { x, y, radius, neck } = frame.get().body;
		const reach = radius + neck + 1;
		return Skia.XYWHRect(x - reach, y - reach, reach * 2, reach * 2);
	});
	const bodyUniforms = useDerivedValue(() => {
		const { x, y, radius, wallX, wallY, wallC, neck } = frame.get().body;
		return wallDropUniformsByName([x, y, radius, 0, 0, wallX, wallY, wallC, neck], bodyColor);
	});
	const glareCentre = useDerivedValue(() => {
		const { x, y, radius } = frame.get().body;
		const off = GLARE_OFFSET * radius;
		return vec(x + off, y + off);
	});
	const glareRadius = useDerivedValue(() => GLARE_RADIUS * frame.get().body.radius);
	const glareBlur = useDerivedValue(() => 0.3 * frame.get().body.radius);

	const captionPitch = useMemo(
		() => pitchToFit(layoutDotMatrix(CAPTION), width - CAPTION_MARGIN, CAPTION_PITCH),
		[width],
	);
	const captionStyle = useAnimatedStyle(() => ({ opacity: caption.get() }));

	return (
		<Animated.View
			style={StyleSheet.absoluteFill}
			entering={FadeIn.duration(300)}
			exiting={FadeOut.duration(150)}
			pointerEvents="none"
		>
			<Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
				<Group opacity={shown}>
					{/* The rim on the window's edge: the cup's at rest, and outward with the thaw */}
					<FrostRim centre={windowCentre} radius={windowRadius} opacity={rim} color={color} />
					<Group opacity={opened}>
						{/* The seat: the frozen player dot under it is covered, leaving its dimple */}
						<Group transform={coverTransform} origin={seatCentre}>
							<Circle c={seatCentre} r={coverRadius} color={INK} />
						</Group>
						{/* The rolling dot: its shade, its body and its glare */}
						<Group opacity={shadeOpacity}>
							<Circle c={shadeCentre} r={seatRadius} color={shade(1)} />
						</Group>
						<Rect rect={bodyRect}>
							<Shader source={WALL_DROP_EFFECT} uniforms={bodyUniforms} />
						</Rect>
						<Circle c={glareCentre} r={glareRadius} color={glass(0.5)}>
							<BlurMask blur={glareBlur} style="normal" />
						</Circle>
					</Group>
				</Group>
			</Canvas>
			<View style={styles.top}>
				<Animated.View style={captionStyle}>
					<DotMatrixText text={CAPTION} pitch={captionPitch} color={color} glow />
				</Animated.View>
			</View>
		</Animated.View>
	);
};

const styles = StyleSheet.create({
	top: {
		alignItems: "center",
		paddingTop: CAPTION_TOP,
	},
});
