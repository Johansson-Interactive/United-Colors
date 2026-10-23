import type React from "react";
import { useCallback, useEffect, useEffectEvent, useRef } from "react";
import { type StyleProp, StyleSheet, View, type ViewStyle } from "react-native";
import { type SharedValue, useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore } from "zustand";
import type { GameSession } from "../application/GameSession";
import type { GameStore } from "../application/GameStore";
import type { GameAudio, GameHaptics, StoragePort, WatchAppActive } from "../application/ports";
import type { TiltReading, TiltSource } from "../application/TiltSource";
import { bindAppLeave } from "../application/useCases/BindAppLeave";
import { calibrateTilt } from "../application/useCases/CalibrateTilt";
import type { Corners, Gravity, PoseSide, ScreenSize } from "../domain/types";
import { CornerMenusProvider } from "./components/CornerMenusProvider";
import type { PressPoint } from "./components/DotButton";
import { FieldTouch } from "./components/FieldTouch";
import { HUD } from "./components/HUD";
import { PausedScore } from "./components/PausedScore";
import { PauseHint } from "./components/PauseHint";
import { PauseWorld } from "./components/PauseWorld";
import { FloodOverlay, useFlood } from "./effects/Flood";
import { pauseContent } from "./flow/pauseContent";
import type { MenuOpening, Screen } from "./flow/screenFlow";
import { GameCanvas } from "./GameCanvas";
import { useAutoStart } from "./hooks/useAutoStart";
import { useBenchStats } from "./hooks/useBenchStats";
import { useDevControlMode } from "./hooks/useDevControlMode";
import { useGameBindings } from "./hooks/useGameBindings";
import { playerColorOf, usePlayerColor, useRestingPlayerColor } from "./hooks/usePlayerColor";
import { type ScoreTally, useScoreTally } from "./hooks/useScoreTally";
import { useScreenFlow } from "./hooks/useScreenFlow";
import { useSensitivitySetting } from "./hooks/useSensitivitySetting";
import { useSessionScene } from "./hooks/useSessionScene";
import { useStageEffects } from "./hooks/useStageEffects";
import { useStageLook } from "./hooks/useStageLook";
import { useStageScene } from "./hooks/useStageScene";
import { StageFrame } from "./layout/StageFrame";
import { BloomOverlay } from "./overlays/BloomOverlay";
import { GameOverOverlay } from "./overlays/GameOverOverlay";
import { GetReadyOverlay } from "./overlays/GetReadyOverlay";
import { KioskOverlay } from "./overlays/KioskOverlay";
import { PauseOverlay } from "./overlays/PauseOverlay";
import { SettleOverlay } from "./overlays/SettleOverlay";
import { SpeedOverlay } from "./overlays/SpeedOverlay";
import { BEZEL, WHITE } from "./theme/theme";
import type { GetReadyEnd } from "./tilt/getReady";
import { useTilt } from "./tilt/TiltProvider";
import type { BloomEnd } from "./touch/bloom";
import { FIELD_UNTOUCHED, touchSteers } from "./touch/fieldTouch";

interface GameScreenProps {
	session: GameSession;
	store: GameStore;
	storage: StoragePort;
	audio: GameAudio;
	haptics: GameHaptics;
	/** Shared with the interface tilt, which starts and stops it; the game only listens */
	tiltSource: TiltSource;
	watchAppActive: WatchAppActive;
	/** How the phone's glass rounds its corners, once known; the arena follows (null: square) */
	corners: Corners | null;
	/** The title's small print: the version and build (see versionTag) */
	versionTag: string;
	/** Start a run in this colour as soon as the title is up, without a press (the bench run) */
	autoStart?: string;
}

export const GameScreen: React.FC<GameScreenProps> = ({
	session,
	store,
	storage,
	audio,
	haptics,
	tiltSource,
	watchAppActive,
	corners,
	versionTag,
	autoStart,
}) => {
	const insets = useSafeAreaInsets();
	const tilt = useTilt();
	// Phase only: the HUD and the game over read their own score, dots never go through React
	const phase = useStore(store, (s) => s.frame.phase);
	const highScore = useStore(store, (s) => s.highScore);
	// The colour as play switches it, on the UI thread; React sees it only once the run stops
	const playerColor = usePlayerColor(store);
	const restingColor = useRestingPlayerColor(store) ?? WHITE;
	const flood = useFlood();
	const scene = useSessionScene(session);

	// Dev only: prefer gyro, fall back to touch drag when gyro is missing (e.g. simulator)
	const { touch: devTouch, detectGyro, onGyroSample } = useDevControlMode();

	useGameBindings(store, audio, haptics, storage);

	// Reads the latest control mode without resubscribing to the tilt when it changes
	const handleTiltReading = useEffectEvent((reading: TiltReading) => {
		// Dev: skip feeding the game while touch is active
		if (devTouch) return;
		onGyroSample();
		session.feedTilt(reading);
	});

	// The game reads the same tilt as the interface, so the dot in the game and the dots on the
	// menus rest in the same hand position. Readings arrive on every screen; the game only moves
	// the player while a run is on.
	useEffect(() => tiltSource.onReading((reading) => handleTiltReading(reading)), [tiltSource]);

	// The arena is the laid-out stage with the glass's corners, which may arrive after it
	const stageSizeRef = useRef<ScreenSize | null>(null);
	useEffect(() => {
		const size = stageSizeRef.current;
		if (size) session.setScreen({ ...size, corners: corners ?? undefined });
	}, [session, corners]);

	// The flow's controls on the game, with the gyro check that goes with play, and the facts it
	// steps on. The stage fade that goes with them is the stage look's
	const { screen, dispatch } = useScreenFlow(store, {
		play: (color) => {
			session.start(color);
			detectGyro();
		},
		pause: () => session.pause(),
		resume: () => session.resume(),
		startKiosk: () => session.startKiosk(),
		haltKiosk: () => session.halt(),
		runKiosk: () => session.run(),
		flood: (color, at, onCovered) => flood.run(color, at.x, at.y, onCovered),
		calibrate: (pose, side) => void calibrateTilt(pose, side, store, storage),
		zeroSwivel: () => tiltSource.zeroSwivel(),
		facts: () => ({
			levelPoseSet: store.getState().settings.levelPoses.up !== null,
			tiltPresent: tilt.available.get(),
			playerColor: playerColorOf(store.getState()),
		}),
	});

	// The score's tally, drawn by the HUD and read by the paused score; its slivers hold the
	// game over until the last arrives
	const handleSliversInAir = useCallback(
		(inAir: boolean) => dispatch({ type: "sliversChanged", inAir }),
		[dispatch],
	);
	const score = useScoreTally(store, handleSliversInAir);

	// Size and corners go straight to the session and the score's tally; the flow decides what
	// the layout starts
	const { place: placeScore } = score;
	const handleLayout = useCallback(
		(size: ScreenSize) => {
			stageSizeRef.current = size;
			session.setScreen({ ...size, corners: corners ?? undefined });
			placeScore(size);
			dispatch({ type: "stageLaidOut" });
		},
		[session, corners, placeScore, dispatch],
	);

	// The pause world, the portal, the frost, the edge wash and the stage fade follow the screen,
	// shake and bursts react to the store; the flood is the transition. The play side and the
	// pause world draw the same room and scene
	const { pauseWorld, hudScore, frost, portal, cut, accent, stageOpacity } = useStageLook(
		{ screen, phase },
		playerColor,
	);
	const stage = useStageScene(scene, accent, frost, pauseWorld);
	const { shake, bursts, burstClock } = useStageEffects(store);

	useAutoStart(autoStart, dispatch);
	useBenchStats(autoStart !== undefined);

	// The field is the way into and out of the pause: a finger landing on it is the flow's to
	// place, and whether it is still down is the bloom's and Get ready's to follow each frame
	const touch = useSharedValue(FIELD_UNTOUCHED);
	const handleFieldTouch = useCallback(
		(landedAt: number) => dispatch({ type: "fieldTouched", landedAt }),
		[dispatch],
	);
	// A drained bloom hands on when its finger lifted, which a second touch is timed from, and
	// whether a finger is down again already
	const handleBloomEnd = useCallback(
		(end: BloomEnd) => {
			if (end === "covered") return dispatch({ type: "bloomCovered" });
			const { liftedAt, down } = touch.get();
			dispatch({ type: "bloomCleared", liftedAt, relanded: down });
		},
		[dispatch, touch],
	);
	// Dev only: where touch steers the dot in play, the field cannot pause it, so a corner dot
	// does, and a drag on the stage moves the dot
	const steers = touchSteers(screen.kind, devTouch);
	const handlePause = useCallback(() => dispatch({ type: "pausePressed" }), [dispatch]);
	const handleDrag = useCallback((dx: number, dy: number) => session.feedDelta(dx, dy), [session]);

	// Leaving the app mid-run or in Get ready lands on the pause screen when the player comes back
	const handleAppLeave = useEffectEvent(() => dispatch({ type: "appLeft" }));
	useEffect(() => bindAppLeave(watchAppActive, () => handleAppLeave()), [watchAppActive]);

	const handleStartPress = useCallback(
		(at: PressPoint, color: string) => dispatch({ type: "startPressed", color, at }),
		[dispatch],
	);
	const handleLevelPress = useCallback(
		(opening: MenuOpening) => dispatch({ type: "levelPressed", ...opening }),
		[dispatch],
	);
	const handleSettled = useCallback(
		(pose: Gravity, side: PoseSide, at: PressPoint) =>
			dispatch({ type: "settled", pose, side, at }),
		[dispatch],
	);
	const handleSettleBack = useCallback(() => dispatch({ type: "settleBacked" }), [dispatch]);
	const handleSnap = useCallback(() => audio.playCollect(0), [audio]);
	// Get ready's portal cleared the field: a snap, and play picks up at once. Or its cup shut
	const handleReadyEnd = useCallback(
		(end: GetReadyEnd) => {
			if (end === "shut") return dispatch({ type: "readyShut" });
			handleSnap();
			dispatch({ type: "readyHeld" });
		},
		[handleSnap, dispatch],
	);
	const handleSpeedPress = useCallback(
		(opening: MenuOpening) => dispatch({ type: "speedPressed", ...opening }),
		[dispatch],
	);
	const handleSpeedBack = useCallback(() => dispatch({ type: "speedBacked" }), [dispatch]);
	const handleRetryPress = useCallback(
		(at: PressPoint) => dispatch({ type: "retryPressed", at }),
		[dispatch],
	);
	const handleLeavePress = useCallback(
		(at: PressPoint) => dispatch({ type: "leavePressed", at }),
		[dispatch],
	);

	const { sensitivity, setSensitivity } = useSensitivitySetting(store, storage, session);

	// Everything lives in the stage frame, clear of the top inset (notch / Dynamic Island) and
	// side insets, which stay black; the playfield runs under the home indicator, the
	// interface layer keeps clear of it. Bottom to top: the pause world and what lies on it (the
	// field's touch layer, the pause's content), the play side cut to the portal (the game
	// canvas, Get ready, the HUD's score) with the bloom's rim on the portal's edge, and then
	// the interface over the stage, never cut: the title, the game over, the bowl, the speed
	// view, the pause hint, and the flood over everything
	const insetStyle = [styles.inset, { paddingBottom: insets.bottom }];
	return (
		<View style={styles.container}>
			<StageFrame corners={corners}>
				{/* The title's and the pause's corner menus read and change their settings here */}
				<CornerMenusProvider
					store={store}
					storage={storage}
					sensitivity={sensitivity}
					onLevel={handleLevelPress}
					onSpeed={handleSpeedPress}
				>
					{pauseWorld && <PauseWorld stage={stage} />}
					<FieldTouch touch={touch} onTouch={handleFieldTouch} enabled={!steers} />
					<PauseSide
						insetStyle={insetStyle}
						screen={screen.kind}
						store={store}
						color={playerColor}
						score={score}
						onQuit={handleLeavePress}
					/>
					<GameCanvas
						stage={stage}
						frost={frost}
						cut={cut}
						stageOpacity={stageOpacity}
						shake={shake}
						bursts={bursts}
						burstClock={burstClock}
						onLayout={handleLayout}
						onDragDelta={steers ? handleDrag : undefined}
					/>

					{screen.kind === "getReady" && (
						<GetReadyOverlay
							scene={scene}
							color={restingColor}
							sensitivity={sensitivity}
							corners={corners}
							touch={touch}
							portal={portal}
							cut={cut}
							onEnd={handleReadyEnd}
						/>
					)}

					{/* The score and its slivers, across the whole field; hidden, not gone, where no play side shows it */}
					<HUD
						score={score}
						color={playerColor}
						visible={hudScore}
						cut={cut}
						onPause={steers ? handlePause : undefined}
						corners={corners}
					/>

					{screen.kind === "frosting" && (
						// Keyed on the start, so a second touch's bloom taking over from a drained one
						// opens afresh under the new finger
						<BloomOverlay
							key={screen.start}
							scene={scene}
							color={restingColor}
							start={screen.start}
							touch={touch}
							corners={corners}
							portal={portal}
							onEnd={handleBloomEnd}
						/>
					)}

					<View style={insetStyle} pointerEvents="box-none">
						<View style={styles.stage} pointerEvents="box-none">
							{screen.kind === "title" && (
								<KioskOverlay
									highScore={highScore}
									onStart={handleStartPress}
									sensitivity={sensitivity}
									versionTag={versionTag}
								/>
							)}

							{screen.kind === "speed" && (
								<SpeedOverlay
									color={screen.color}
									sensitivity={sensitivity}
									onSelect={setSensitivity}
									onBack={handleSpeedBack}
								/>
							)}

							{screen.kind === "settle" && (
								<SettleOverlay
									color={screen.color}
									onSettled={handleSettled}
									onBack={handleSettleBack}
									onSnap={handleSnap}
								/>
							)}

							{screen.kind === "gameOver" && (
								<GameOverOverlay
									store={store}
									color={restingColor}
									audio={audio}
									onRetry={handleRetryPress}
									onBack={handleLeavePress}
								/>
							)}

							<PauseHint store={store} screen={screen.kind} fieldPauses={!devTouch} />
						</View>
					</View>
				</CornerMenusProvider>

				<FloodOverlay flood={flood} />
			</StageFrame>
		</View>
	);
};

interface PauseSideProps {
	insetStyle: StyleProp<ViewStyle>;
	screen: Screen["kind"];
	store: GameStore;
	color: SharedValue<string>;
	score: ScoreTally;
	onQuit: (at: PressPoint) => void;
}

/**
 * The pause's content on the pause world, over the field's touch layer and under the play side
 * (see GameCanvas): plain views that are never cut by the portal. It is in place under the
 * bloom and around Get ready, pressable only on the pause (see pauseContent.ts).
 */
const PauseSide: React.FC<PauseSideProps> = ({
	insetStyle,
	screen,
	store,
	color,
	score,
	onQuit,
}) => {
	const content = pauseContent(screen);
	return (
		<View style={insetStyle} pointerEvents="box-none">
			{content && (
				<View style={styles.stage} pointerEvents="box-none">
					<PauseOverlay content={content} onQuit={onQuit} />
					{/* The paused score and run time, still in the middle, with the pause's content */}
					<PausedScore store={store} color={color} score={score} />
				</View>
			)}
		</View>
	);
};

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: BEZEL,
	},
	inset: {
		...StyleSheet.absoluteFill,
	},
	stage: {
		flex: 1,
	},
});
