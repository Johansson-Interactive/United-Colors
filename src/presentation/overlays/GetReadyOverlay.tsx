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
import { useMemo, useState } from "react";
import { StyleSheet } from "react-native";
import Animated, { FadeOut, type SharedValue, useDerivedValue } from "react-native-reanimated";
import { playerDisc } from "../../application/sceneRecord";
import type { Corners } from "../../domain/types";
import { PlaySide } from "../components/PlaySide";
import { PortalRim } from "../components/PortalRim";
import { type Portal, seatOf } from "../effects/portal";
import { useFieldSize } from "../hooks/useFieldSize";
import { usePortalStepper } from "../hooks/usePortalStepper";
import type { PortalCut } from "../hooks/useStageLook";
import { LIQUID_WOBBLE } from "../liquidShader";
import { WALL_DROP_EFFECT } from "../sceneDrawer";
import { BOWL_GLAZE, BOWL_GLAZE_STOPS, BOWL_RIM, glass, INK, shade } from "../theme/theme";
import {
	advanceGetReady,
	type GetReadyEnd,
	type GetReadyFrameState,
	openGetReady,
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
	/**
	 * Fired once, as Get ready ends: the moment the portal has widened past the walls, or when
	 * the cup has shut after the finger lifted
	 */
	onEnd: (end: GetReadyEnd) => void;
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

/** The cover over the frozen player reaches past its ripples (see LIQUID_WOBBLE) and its edge */
const COVER_SCALE = 1 + LIQUID_WOBBLE;
const COVER_MARGIN = 0.5;

/**
 * Get ready: a portal into play opens at the seat, where the player dot froze, growing with the
 * held finger at the bloom's pace to the title's bowl: the cup, wearing the rim in the player's
 * colour, which pulses like a point dot once the cup is fully open. A solid copy of the dot
 * rolls around inside the cup with the tilt from the finger's landing, held in by its glass as
 * it grows, with a little weight to it, and presses into a wall as the player does in play. Rolling it home and
 * holding level widens the portal to the walls, and the moment the field is clear play resumes;
 * the portal is left open, so the pause world goes behind it unseen. Lift the finger first and the
 * portal drains back into the seat, and Get ready is over. Nothing here fades in; on resume all
 * that is left drawn is the dot copy on the seat, which fades into the real dot. Touches go
 * through to the field touch layer.
 *
 * The rules live in the get-ready stepper, which usePortalStepper runs a step a frame on the UI
 * thread, where the tilt and the touch are. It drives `portal`,
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
	onEnd,
}) => {
	const tilt = useTilt();
	const field = useFieldSize(corners);
	// The scene is frozen, so the seat stays where the player dot froze for Get ready's life
	const [seat] = useState(() => seatOf(playerDisc(scene.get()), field));
	const advance = (state: GetReadyFrameState, dt: number) => {
		"worklet";
		return advanceGetReady(state, {
			seat,
			held: touch.get().down,
			tilt: { x: tilt.x.get(), y: tilt.y.get() },
			dt,
			field,
			sensitivity,
		});
	};
	const frame = usePortalStepper(() => openGetReady(seat, field), advance, portal, onEnd);

	const seatCentre = vec(seat.x, seat.y);
	// The frozen player is stretched along its jelly stretch, so its cover is too (see drawScene)
	const coverRadius = seat.radius * COVER_SCALE + COVER_MARGIN;
	const coverTransform = useMemo(() => {
		const k = 1 + Math.hypot(seat.stretchX, seat.stretchY);
		const angle = Math.atan2(seat.stretchY, seat.stretchX);
		return [{ rotate: angle }, { scaleX: k }, { scaleY: 1 / k }, { rotate: -angle }];
	}, [seat]);
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
		return SHADE_MAX * Math.min(1, Math.hypot(dot.x - seat.x, dot.y - seat.y) / SHADE_FULL_AT);
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
						<Circle c={shadeCentre} r={seat.radius} color={shade(1)} />
					</Group>
					<Rect rect={bodyRect}>
						<Shader source={WALL_DROP_EFFECT} uniforms={bodyUniforms} />
					</Rect>
					<Circle c={glareCentre} r={glareRadius} color={glass(0.5)}>
						<BlurMask blur={glareBlur} style="normal" />
					</Circle>
				</PlaySide>
				{/* The rim on the portal's edge, over both worlds and never cut, as the bloom's is */}
				<PortalRim centre={portalCentre} radius={portalRadius} opacity={rim} color={color} />
			</Canvas>
		</Animated.View>
	);
};
