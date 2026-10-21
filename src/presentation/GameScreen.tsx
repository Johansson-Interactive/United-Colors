import type React from "react";
import { useCallback, useEffect, useEffectEvent, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore } from "zustand";
import type { GameSession } from "../application/GameSession";
import type { GameStore, GameStoreState } from "../application/GameStore";
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
import { CornerMenusProvider, type MenuOpening } from "./components/CornerMenusProvider";
import type { PressPoint } from "./components/DotButton";
import { HUD } from "./components/HUD";
import { PausedScore } from "./components/PausedScore";
import { FloodOverlay, useFlood } from "./effects/Flood";
import { cornerDot } from "./flow/screenFlow";
import { GameCanvas } from "./GameCanvas";
import { useAutoStart } from "./hooks/useAutoStart";
import { useBenchStats } from "./hooks/useBenchStats";
import { useDevControlMode } from "./hooks/useDevControlMode";
import { useGameBindings } from "./hooks/useGameBindings";
import { useScreenFlow } from "./hooks/useScreenFlow";
import { useSensitivitySetting } from "./hooks/useSensitivitySetting";
import { useSessionScene } from "./hooks/useSessionScene";
import { useStageEffects } from "./hooks/useStageEffects";
import { useStageLook } from "./hooks/useStageLook";
import { StageFrame } from "./layout/StageFrame";
import { GameOverOverlay } from "./overlays/GameOverOverlay";
import { GetReadyOverlay } from "./overlays/GetReadyOverlay";
import { KioskOverlay } from "./overlays/KioskOverlay";
import { PauseOverlay } from "./overlays/PauseOverlay";
import { SettleOverlay } from "./overlays/SettleOverlay";
import { SpeedOverlay } from "./overlays/SpeedOverlay";
import { BEZEL, WHITE } from "./theme/theme";
import { useTilt } from "./tilt/TiltProvider";
import { NO_ZERO } from "./tilt/tiltZero";

/** The player dot's colour, white while there is none */
const playerColorOf = (s: GameStoreState) =>
	s.frame.dots.find((d) => d.kind === "player")?.color ?? WHITE;

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
	// Phase only: the HUD and the game over read their own score, dots never go through React
	const phase = useStore(store, (s) => s.frame.phase);
	const highScore = useStore(store, (s) => s.highScore);
	const playerColor = useStore(store, playerColorOf);
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
	const { frost, frostWindow, accent, stageOpacity } = useStageLook({ screen, phase, playerColor });
	const { shake, bursts, burstClock } = useStageEffects(store);

	useAutoStart(autoStart, dispatch);
	useBenchStats(autoStart !== undefined);

	// The corner dot does what it shows; the flow decides what that is on this screen
	const corner = cornerDot(screen);
	const handleCorner = useCallback(() => dispatch({ type: "cornerPressed" }), [dispatch]);

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
					frostWindow={frostWindow}
					accent={accent}
					stageOpacity={stageOpacity}
					shake={shake}
					bursts={bursts}
					burstClock={burstClock}
					onLayout={handleLayout}
					onDragDelta={devTouch ? (dx, dy) => session.feedDelta(dx, dy) : undefined}
				/>

				{screen.kind === "getReady" && (
					<GetReadyOverlay
						scene={scene}
						color={playerColor}
						sensitivity={sensitivity}
						corners={corners}
						frostWindow={frostWindow}
						onReady={handleReady}
					/>
				)}

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

							{screen.kind === "pause" && (
								<PauseOverlay color={playerColor} onQuit={handleLeavePress} />
							)}
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
								color={playerColor}
								audio={audio}
								onRetry={handleRetryPress}
								onBack={handleLeavePress}
							/>
						)}

						{/* The paused score and run time, sinking in from the HUD's spot and rising back */}
						<PausedScore store={store} color={playerColor} screen={screen.kind} />

						{/* Over the pause's own controls, so its corner dot stays pressable */}
						{corner && (
							<HUD
								store={store}
								color={playerColor}
								showScore={screen.kind === "hud"}
								corner={corner}
								onCorner={handleCorner}
								corners={corners}
							/>
						)}
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
