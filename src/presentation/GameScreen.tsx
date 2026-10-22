import type React from "react";
import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore } from "zustand";
import type { GameSession } from "../application/GameSession";
import type { GameStore } from "../application/GameStore";
import type {
	GameAudio,
	GameHaptics,
	SensorPort,
	SensorSample,
	StoragePort,
	WatchAppActive,
} from "../application/ports";
import { bindAppLeave } from "../application/useCases/BindAppLeave";
import { bindTiltZero } from "../application/useCases/BindTiltZero";
import { calibrateTilt } from "../application/useCases/CalibrateTilt";
import type { Corners, ScreenSize, TiltZero } from "../domain/types";
import { CornerMenusProvider } from "./components/CornerMenusProvider";
import type { PressPoint } from "./components/DotButton";
import { FieldTouch } from "./components/FieldTouch";
import { HUD } from "./components/HUD";
import { PausedScore } from "./components/PausedScore";
import { PauseHint } from "./components/PauseHint";
import { ScoreMeter } from "./components/ScoreMeter";
import { FloodOverlay, useFlood } from "./effects/Flood";
import type { Point } from "./effects/frost";
import type { MenuOpening } from "./flow/screenFlow";
import { GameCanvas } from "./GameCanvas";
import { useAutoStart } from "./hooks/useAutoStart";
import { useBenchStats } from "./hooks/useBenchStats";
import { useDevControlMode } from "./hooks/useDevControlMode";
import { useGameBindings } from "./hooks/useGameBindings";
import { playerColorOf, usePlayerColor, useRestingPlayerColor } from "./hooks/usePlayerColor";
import { useScreenFlow } from "./hooks/useScreenFlow";
import { useSensitivitySetting } from "./hooks/useSensitivitySetting";
import { useSessionScene } from "./hooks/useSessionScene";
import { useStageEffects } from "./hooks/useStageEffects";
import { useStageLook } from "./hooks/useStageLook";
import { StageFrame } from "./layout/StageFrame";
import { FrostBloomOverlay } from "./overlays/FrostBloomOverlay";
import { GameOverOverlay } from "./overlays/GameOverOverlay";
import { GetReadyOverlay } from "./overlays/GetReadyOverlay";
import { KioskOverlay } from "./overlays/KioskOverlay";
import { PauseOverlay } from "./overlays/PauseOverlay";
import { SettleOverlay } from "./overlays/SettleOverlay";
import { SpeedOverlay } from "./overlays/SpeedOverlay";
import { BEZEL, WHITE } from "./theme/theme";
import { useTilt } from "./tilt/TiltProvider";
import { NO_ZERO } from "./tilt/tiltZero";
import { FIELD_UNTOUCHED } from "./touch/fieldTouch";

interface GameScreenProps {
	session: GameSession;
	store: GameStore;
	storage: StoragePort;
	audio: GameAudio;
	haptics: GameHaptics;
	/** Shared with the interface tilt, which starts and stops it; the game only listens */
	sensor: SensorPort;
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
	sensor,
	watchAppActive,
	corners,
	versionTag,
	autoStart,
}) => {
	const insets = useSafeAreaInsets();
	const tilt = useTilt();
	// Phase only: the score meter and the game over read their own score, dots never go through React
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

	// The level pose reaches the game and the interface together, so the dot in the game and
	// the dots on the menus rest in the same hand position
	useEffect(
		() =>
			bindTiltZero(store, (zero: TiltZero | null, zeroDown: TiltZero | null) => {
				session.setTiltZero(zero, zeroDown);
				tilt.zero.set(zero ?? NO_ZERO);
				tilt.zeroDown.set(zeroDown ?? NO_ZERO);
			}),
		[session, tilt, store],
	);

	// Reads the latest control mode without resubscribing the sensor when it changes
	const handleSensorSample = useEffectEvent((sample: SensorSample) => {
		// Dev: skip feeding the game while touch is active
		if (devTouch) return;
		onGyroSample();
		session.feedTilt(sample);
	});

	// Samples arrive on every screen; the game only moves the player while a run is on
	useEffect(() => sensor.onSample((sample) => handleSensorSample(sample)), [sensor]);

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
		calibrate: (zero, facingDown) => void calibrateTilt(zero, store, storage, facingDown),
		facts: () => ({
			levelPoseSet: store.getState().settings.tiltZero !== null,
			tiltPresent: tilt.available.get(),
			playerColor: playerColorOf(store.getState()),
		}),
	});

	// Size and corners go straight to the session; the flow decides what the layout starts
	const handleLayout = useCallback(
		(size: ScreenSize) => {
			stageSizeRef.current = size;
			session.setScreen({ ...size, corners: corners ?? undefined });
			dispatch({ type: "stageLaidOut" });
		},
		[session, corners, dispatch],
	);

	// The frost, the edge wash and the stage fade follow the screen, shake and bursts react to
	// the store; the flood is the transition
	const { frost, frostEdge, accent, stageOpacity } = useStageLook({ screen, phase }, playerColor);
	const { shake, bursts, burstClock } = useStageEffects(store);

	useAutoStart(autoStart, dispatch);
	useBenchStats(autoStart !== undefined);

	// The field is the way into and out of the pause: a finger landing on it is the flow's to
	// place, and whether it is still down is the bloom's and Get ready's to follow each frame
	const touch = useSharedValue(FIELD_UNTOUCHED);
	const handleFieldTouch = useCallback(
		(at: Point) => dispatch({ type: "fieldTouched", at }),
		[dispatch],
	);
	const handleBloomCovered = useCallback(() => dispatch({ type: "bloomCovered" }), [dispatch]);
	const handleBloomCleared = useCallback(() => dispatch({ type: "bloomCleared" }), [dispatch]);
	const handleReadyShut = useCallback(() => dispatch({ type: "readyShut" }), [dispatch]);
	// Dev only: with touch steering the dot, the field cannot pause it, so a corner dot does
	const handlePause = useCallback(() => dispatch({ type: "pausePressed" }), [dispatch]);
	const fieldTouchEnabled = !devTouch || screen.kind !== "hud";
	const inPlay = screen.kind === "hud" || screen.kind === "frosting";

	// The score meter's slivers hold the game over until the last arrives, and the paused score
	// shows what it had counted as the run froze
	const handleSliversInAir = useCallback(
		(inAir: boolean) => dispatch({ type: "sliversChanged", inAir }),
		[dispatch],
	);
	const [frozenScore, setFrozenScore] = useState<number | null>(null);

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
		(zero: TiltZero, facingDown: boolean, at: PressPoint) =>
			dispatch({ type: "settled", zero, facingDown, at }),
		[dispatch],
	);
	const handleSettleBack = useCallback(() => dispatch({ type: "settleBacked" }), [dispatch]);
	const handleSnap = useCallback(() => audio.playCollect(0), [audio]);
	// The thaw cleared the field: a snap, and play picks up at once
	const handleReady = useCallback(() => {
		handleSnap();
		dispatch({ type: "readyHeld" });
	}, [handleSnap, dispatch]);
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
	// interface layer keeps clear of it
	return (
		<View style={styles.container}>
			<StageFrame corners={corners}>
				<GameCanvas
					scene={scene}
					frost={frost}
					frostEdge={frostEdge}
					accent={accent}
					stageOpacity={stageOpacity}
					shake={shake}
					bursts={bursts}
					burstClock={burstClock}
					onLayout={handleLayout}
					onDragDelta={devTouch ? (dx, dy) => session.feedDelta(dx, dy) : undefined}
				/>

				<FieldTouch touch={touch} onTouch={handleFieldTouch} enabled={fieldTouchEnabled} />

				{screen.kind === "frosting" && (
					<FrostBloomOverlay
						scene={scene}
						color={restingColor}
						origin={screen.at}
						touch={touch}
						corners={corners}
						frostEdge={frostEdge}
						onCovered={handleBloomCovered}
						onCleared={handleBloomCleared}
					/>
				)}

				{screen.kind === "getReady" && (
					<GetReadyOverlay
						scene={scene}
						color={restingColor}
						sensitivity={sensitivity}
						corners={corners}
						touch={touch}
						frostEdge={frostEdge}
						onReady={handleReady}
						onShut={handleReadyShut}
					/>
				)}

				{/* The score and its slivers, across the whole field; it outlives the HUD through a pause */}
				<ScoreMeter
					store={store}
					color={playerColor}
					visible={inPlay}
					onSliversInAir={handleSliversInAir}
					onFrozenScore={setFrozenScore}
				/>

				<View style={[styles.inset, { paddingBottom: insets.bottom }]} pointerEvents="box-none">
					<View style={styles.stage} pointerEvents="box-none">
						{/* The title's and the pause's corner menus read and change their settings here */}
						<CornerMenusProvider
							store={store}
							storage={storage}
							sensitivity={sensitivity}
							onLevel={handleLevelPress}
							onSpeed={handleSpeedPress}
						>
							{screen.kind === "title" && (
								<KioskOverlay
									highScore={highScore}
									onStart={handleStartPress}
									sensitivity={sensitivity}
									versionTag={versionTag}
								/>
							)}

							{screen.kind === "pause" && <PauseOverlay onQuit={handleLeavePress} />}
						</CornerMenusProvider>

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

						{/* The paused score and run time, sinking in from the HUD's spot and rising back */}
						<PausedScore
							store={store}
							color={playerColor}
							screen={screen.kind}
							frozenScore={frozenScore}
						/>

						<PauseHint store={store} screen={screen.kind} fieldPauses={!devTouch} />

						{inPlay && <HUD onPause={devTouch ? handlePause : undefined} corners={corners} />}
					</View>
				</View>

				<FloodOverlay flood={flood} />
			</StageFrame>
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
