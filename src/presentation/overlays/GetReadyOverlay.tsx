import {
	BlurMask,
	Canvas,
	Circle,
	Group,
	RadialGradient,
	Rect,
	Shader,
	Skia,
	vec,
} from "@shopify/react-native-skia";
import type React from "react";
import { useEffect, useMemo } from "react";
import { StyleSheet } from "react-native";
import Animated, {
	FadeOut,
	type SharedValue,
	useDerivedValue,
	useFrameCallback,
	useSharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { playerDisc } from "../../application/sceneRecord";
import { cornerExtent } from "../../domain/arena";
import type { Corners } from "../../domain/types";
import { PlaySide, type PortalCut } from "../components/PlaySide";
import { PortalRim } from "../components/PortalRim";
import { PAUSE_ALL, type Portal } from "../effects/portal";
import { useStageBox } from "../layout/StageFrame";
import { LIQUID_WOBBLE } from "../liquidShader";
import { WALL_DROP_EFFECT } from "../sceneDrawer";
import { BOWL_GLAZE, BOWL_GLAZE_STOPS, BOWL_RIM, glass, INK, shade } from "../theme/theme";
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
	/** The player's colour: the rolling dot and the rim wear it */
	color: string;
	/** The rolling dot moves this many times its usual distance per tilt, like the player dot */
	sensitivity: number;
	/** How the stage's corners are rounded, so the dot rolls round them (null: square) */
	corners: Corners | null;
	/** Whether the finger on the pause is still down, as the field touch layer keeps it; lifted, the cup drains */
	touch: SharedValue<FieldTouchState>;
	/** The portal, which this opens at the seat and widens with the hold */
	portal: SharedValue<Portal>;
	/** How the play side is cut to the portal: all drawn here is on the play side (see PlaySide) */
	cut: PortalCut | null;
	/** Fired once, the moment the portal has widened past the walls */
	onReady: () => void;
	/** Fired once, when the cup has shut after the finger lifted */
	onShut: () => void;
}

/** On resume the dot copy fades into the real dot on the seat in this long */
const HANDOFF_MS = 150;
/** The glare on the rolling dot, as fractions of its radius; the light is frozen with the field */
const GLARE_OFFSET = -0.28;
const GLARE_RADIUS = 0.4;
/** The shade the rolling dot casts once off the seat, and how far it trails downhill */
const SHADE_MAX = 0.35;
const SHADE_FULL_AT = 40;
const SHADE_TRAIL = 8;

/** Before the first frame is stepped nothing is drawn */
const BEFORE_FIRST_FRAME: GetReadyFrame = {
	drawn: false,
	seat: NO_SEAT,
	dot: { x: 0, y: 0 },
	body: { x: 0, y: 0, radius: 0, wallX: 0, wallY: 0, wallC: 0, neck: 0 },
	portal: PAUSE_ALL,
	rim: 0,
	opened: 0,
	glass: 0,
	fired: false,
	shut: false,
};
/** The cover over the frozen player reaches past its ripples (see LIQUID_WOBBLE) and its edge */
const COVER_SCALE = 1 + LIQUID_WOBBLE;
const COVER_MARGIN = 0.5;

/**
 * Get ready: a portal into play opens at the seat, where the player dot froze, growing with the
 * held finger at the bloom's pace to the title's bowl: the cup, wearing the rim in the player's
 * colour, which pulses like a point dot once the cup is fully open. A solid copy of the dot
 * waits on the seat until then, and then rolls around inside the cup with the tilt, with a
 * little weight to it, and presses into a wall as the player does in play. Rolling it home and
 * holding level widens the portal to the walls, and the moment the field is clear play resumes;
 * the portal is left open, so the pause world goes behind it unseen. Lift the finger first and the
 * portal drains back into the seat, and Get ready is over. Nothing here fades in; on resume all
 * that is left drawn is the dot copy on the seat, which fades into the real dot. Touches go
 * through to the field touch layer.
 *
 * The rules live in the get-ready stepper: each frame, on the UI thread where the tilt and the
 * touch are, this takes one step of it and copies what it says to draw. It drives `portal`,
 * which every canvas on the play side is cut to (see PlaySide), this one too: the field, the
 * HUD's score and what is drawn here (the bowl's glass at the edge, the seat and the dot) show
 * only inside the portal, over the pause world, and grow into view with it. The rim on the
 * portal's edge is drawn uncut, over both worlds, as the bloom's is (see BloomOverlay), so the
 * two rims look the same.
 */
export const GetReadyOverlay: React.FC<GetReadyOverlayProps> = ({
	scene,
	color,
	sensitivity,
	corners,
	touch,
	portal,
	cut,
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
		frame.set(now);
		portal.set(now.portal);
		if (now.fired) scheduleOnRN(onReady);
		if (now.shut) scheduleOnRN(onShut);
	});

	// Leaves the portal the stepper says on close: open once fired, the pause all over otherwise
	useEffect(
		() => () => {
			portal.set(closeGetReady(state.get(), portal.get()));
		},
		[state, portal],
	);

	const shown = useDerivedValue(() => (frame.get().drawn ? 1 : 0));
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
	const portalCentre = useDerivedValue(() => vec(frame.get().portal.x, frame.get().portal.y));
	const portalRadius = useDerivedValue(() => frame.get().portal.radius);
	const rim = useDerivedValue(() => frame.get().rim);
	const glassShows = useDerivedValue(() => frame.get().glass);
	const glassRimRadius = useDerivedValue(() => Math.max(0, frame.get().portal.radius - 1));

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

	return (
		// Leaving on resume, only the dot copy is still drawn (the rim and the glass are gone past
		// the walls, and play shows all over), so this fades the copy into the real dot; leaving
		// otherwise, the cup has drained already and nothing of it shows
		<Animated.View
			style={StyleSheet.absoluteFill}
			exiting={FadeOut.duration(HANDOFF_MS)}
			pointerEvents="none"
		>
			<Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
				<PlaySide cut={cut}>
					<Group opacity={shown}>
						{/* The seat: the frozen player dot under it is covered, leaving its dimple */}
						<Group transform={coverTransform} origin={seatCentre}>
							<Circle c={seatCentre} r={coverRadius} color={INK} />
						</Group>
						{/* The bowl's glass at the portal's edge, as the cup grows and while it is open */}
						<Group opacity={glassShows}>
							<Circle c={portalCentre} r={portalRadius}>
								<RadialGradient
									c={portalCentre}
									r={portalRadius}
									colors={BOWL_GLAZE}
									positions={BOWL_GLAZE_STOPS}
								/>
							</Circle>
							<Circle
								c={portalCentre}
								r={glassRimRadius}
								color={BOWL_RIM}
								style="stroke"
								strokeWidth={1.5}
							/>
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
				</PlaySide>
				{/* The rim on the portal's edge, over both worlds and never cut, as the bloom's is */}
				<Group opacity={shown}>
					<PortalRim centre={portalCentre} radius={portalRadius} opacity={rim} color={color} />
				</Group>
			</Canvas>
		</Animated.View>
	);
};
