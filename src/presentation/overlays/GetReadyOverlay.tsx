import { BlurMask, Canvas, Circle, Group, vec } from "@shopify/react-native-skia";
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
import { playerDisc, type StretchedDisc } from "../../application/sceneRecord";
import { cornerExtent } from "../../domain/arena";
import type { Corners } from "../../domain/types";
import { DotMatrixText } from "../components/DotMatrixText";
import { layoutDotMatrix, pitchToFit } from "../dotmatrix/layout";
import { type FrostWindow, NO_FROST_WINDOW } from "../effects/frost";
import { useStageBox } from "../layout/StageFrame";
import { LIQUID_WOBBLE } from "../liquidShader";
import { glass, INK, shade } from "../theme/theme";
import {
	INITIAL_GET_READY,
	isHolding,
	type Roll,
	rimOpacity,
	rollAt,
	rollTarget,
	seated,
	seatPulse,
	stepGetReady,
	stepRoll,
	windowRadius,
	windowReach,
} from "../tilt/getReady";
import { useTilt } from "../tilt/TiltProvider";

interface GetReadyOverlayProps {
	/** The frozen scene, for where the player dot froze (the seat) and how big it is */
	scene: SharedValue<Float32Array>;
	/** The player's colour: the rolling dot, the rim and the caption wear it */
	color: string;
	/** The rolling dot moves this many times its usual distance per tilt, like the player dot */
	sensitivity: number;
	/** How the stage's corners are rounded, so the dot rolls round them (null: square) */
	corners: Corners | null;
	/** The clear window in the frost, which this keeps on the seat and widens with the hold */
	frostWindow: SharedValue<FrostWindow>;
	/** Fired once, the moment the thaw clears the field */
	onReady: () => void;
}

const CAPTION = "ROLL IT HOME";
/** The caption's pitch where it fits, the same as the PAUSED it stands in for */
const CAPTION_PITCH = 8;
/** Room the caption keeps from the stage's sides */
const CAPTION_MARGIN = 48;
const CAPTION_FADE_MS = 250;
const RIM_STROKE = 2;
/** The rim's soft glow: a wider, blurred stroke under it */
const RIM_GLOW_STROKE = 6;
const RIM_GLOW_BLUR = 6;
/** The glare on the rolling dot, as fractions of its radius; the light is frozen with the field */
const GLARE_OFFSET = -0.28;
const GLARE_RADIUS = 0.4;
/** The shade the rolling dot casts once off the seat, and how far it trails downhill */
const SHADE_MAX = 0.35;
const SHADE_FULL_AT = 40;
const SHADE_TRAIL = 8;

/** With no player in the scene (it should always have one here) nothing is drawn */
const NO_SEAT: StretchedDisc = { x: 0, y: 0, radius: 0, stretchX: 0, stretchY: 0 };
/** The cover over the frozen player reaches past its ripples (see LIQUID_WOBBLE) and its edge */
const COVER_SCALE = 1 + LIQUID_WOBBLE;
const COVER_MARGIN = 0.5;

/**
 * Get ready: the field stays frosted from the pause, and the seat, where the player dot froze,
 * is the one clear window in it, its rim pulsing in the player's colour like a point dot. A
 * solid copy of the dot rolls off the seat with the tilt, with a little weight to it. Rolling
 * it home and holding level thaws the frost outward from the seat, and the moment the field
 * is clear play resumes; the window is left open, so the frost lifts behind it unseen. One
 * caption says what to do; it fades while the player holds and comes back when the hold
 * breaks. Taps go through to nothing.
 *
 * The rules live in the get-ready stepper, run here on the UI thread where the tilt is. The
 * window itself is cut by the game canvas, which this drives through `frostWindow`.
 */
export const GetReadyOverlay: React.FC<GetReadyOverlayProps> = ({
	scene,
	color,
	sensitivity,
	corners,
	frostWindow,
	onReady,
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
	const state = useSharedValue(INITIAL_GET_READY);
	const holding = useSharedValue(false);
	// The caption's opacity: up until the hold grows, back as soon as it breaks
	const caption = useSharedValue(1);

	// The scene is frozen, so the seat is where the player is drawn in it throughout
	const seat = useDerivedValue(() => playerDisc(scene.get()) ?? NO_SEAT);
	const roll = useSharedValue<Roll | null>(null);

	useFrameCallback((info) => {
		const dt = info.timeSincePreviousFrame ?? 16;
		const at = seat.get();
		const tiltNow = { x: tilt.x.get(), y: tilt.y.get() };
		const rolling = roll.get() ?? rollAt(at);
		roll.set(stepRoll(rolling, rollTarget(at, tiltNow, sensitivity, field), dt));

		const prev = state.get();
		const next = stepGetReady(prev, tiltNow.x, tiltNow.y, dt);
		// Once fired the stepper answers with the same state, so what follows runs once
		if (next === prev) return;
		state.set(next);
		const breath = seatPulse(next.elapsedMs) * (1 - seated(rolling, at));
		frostWindow.set({
			x: at.x,
			y: at.y,
			radius: windowRadius(next.progress, at.radius, windowReach(at, field), breath),
		});
		const nowHolding = isHolding(prev, next);
		if (nowHolding !== holding.get()) {
			holding.set(nowHolding);
			caption.set(withTiming(nowHolding ? 0 : 1, { duration: CAPTION_FADE_MS }));
		}
		if (next.fired) scheduleOnRN(onReady);
	});

	// Closed again when Get ready closes without firing (the pause dot, leaving the app), so the
	// pause screen is frosted all over; fired, it is left open for the frost to lift behind it
	useEffect(
		() => () => {
			if (!state.get().fired) frostWindow.set(NO_FROST_WINDOW);
		},
		[state, frostWindow],
	);

	const shown = useDerivedValue(() => (seat.get().radius > 0 ? 1 : 0));
	const seatCentre = useDerivedValue(() => vec(seat.get().x, seat.get().y));
	const seatRadius = useDerivedValue(() => seat.get().radius);
	// The frozen player is stretched along its jelly stretch, so its cover is too (see drawScene)
	const coverRadius = useDerivedValue(() => seat.get().radius * COVER_SCALE + COVER_MARGIN);
	const coverTransform = useDerivedValue(() => {
		const { stretchX, stretchY } = seat.get();
		const k = 1 + Math.hypot(stretchX, stretchY);
		const angle = Math.atan2(stretchY, stretchX);
		return [{ rotate: angle }, { scaleX: k }, { scaleY: 1 / k }, { rotate: -angle }];
	});
	const rimRadius = useDerivedValue(() => frostWindow.get().radius);
	const rim = useDerivedValue(() => {
		const r = roll.get();
		const s = state.get();
		const home = r ? seated(r, seat.get()) : 1;
		return rimOpacity(s.progress, home, seatPulse(s.elapsedMs));
	});
	const rimGlow = useDerivedValue(() => rim.get() * 0.4);

	const dotCentre = useDerivedValue(() => {
		const r = roll.get() ?? seat.get();
		return vec(r.x, r.y);
	});
	const shadeCentre = useDerivedValue(() => {
		const r = roll.get() ?? seat.get();
		return vec(r.x + tilt.x.get() * SHADE_TRAIL, r.y + tilt.y.get() * SHADE_TRAIL + 2);
	});
	const shadeOpacity = useDerivedValue(() => {
		const r = roll.get();
		const s = seat.get();
		if (!r) return 0;
		return SHADE_MAX * Math.min(1, Math.hypot(r.x - s.x, r.y - s.y) / SHADE_FULL_AT);
	});
	const glareCentre = useDerivedValue(() => {
		const c = dotCentre.get();
		const off = GLARE_OFFSET * seatRadius.get();
		return vec(c.x + off, c.y + off);
	});
	const glareRadius = useDerivedValue(() => GLARE_RADIUS * seatRadius.get());
	const glareBlur = useDerivedValue(() => 0.3 * seatRadius.get());

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
			<Canvas style={StyleSheet.absoluteFill}>
				<Group opacity={shown}>
					{/* The seat: the frozen player dot under it is covered, leaving its dimple */}
					<Group transform={coverTransform} origin={seatCentre}>
						<Circle c={seatCentre} r={coverRadius} color={INK} />
					</Group>
					{/* The rim on the window's edge, glowing softly */}
					<Group opacity={rimGlow}>
						<Circle
							c={seatCentre}
							r={rimRadius}
							color={color}
							style="stroke"
							strokeWidth={RIM_GLOW_STROKE}
						>
							<BlurMask blur={RIM_GLOW_BLUR} style="normal" />
						</Circle>
					</Group>
					<Group opacity={rim}>
						<Circle
							c={seatCentre}
							r={rimRadius}
							color={color}
							style="stroke"
							strokeWidth={RIM_STROKE}
						/>
					</Group>
					{/* The rolling dot: its shade, its body and its glare */}
					<Group opacity={shadeOpacity}>
						<Circle c={shadeCentre} r={seatRadius} color={shade(1)} />
					</Group>
					<Circle c={dotCentre} r={seatRadius} color={color} />
					<Circle c={glareCentre} r={glareRadius} color={glass(0.5)}>
						<BlurMask blur={glareBlur} style="normal" />
					</Circle>
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
		paddingTop: 52,
	},
});
