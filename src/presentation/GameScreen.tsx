import type React from "react";
import { useCallback, useEffect, useEffectEvent, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { useSharedValue, withTiming } from "react-native-reanimated";
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
import type { PressPoint } from "./components/DotButton";
import { HUD } from "./components/HUD";
import { PausedScore } from "./components/PausedScore";
import { FloodOverlay, useFlood } from "./effects/Flood";
import { FrostDim } from "./effects/FrostDim";
import { cornerDot, type FlowAction, fieldFrosted } from "./flow/screenFlow";
import { GameCanvas } from "./GameCanvas";
import { useAutoStart } from "./hooks/useAutoStart";
import { useBenchStats } from "./hooks/useBenchStats";
import { useDevControlMode } from "./hooks/useDevControlMode";
import { useGameBindings } from "./hooks/useGameBindings";
import { useScreenFlow } from "./hooks/useScreenFlow";
import { useSensitivitySetting } from "./hooks/useSensitivitySetting";
import { useSessionScene } from "./hooks/useSessionScene";
import { useSoundToggles } from "./hooks/useSoundToggles";
import { useStageEffects } from "./hooks/useStageEffects";
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
	const soundEnabled = useStore(store, (s) => s.settings.soundEnabled);
	const musicEnabled = useStore(store, (s) => s.settings.musicEnabled);
	const playerColor = useStore(
		store,
		(s) => s.frame.dots.find((d) => d.kind === "player")?.color ?? WHITE,
	);
	const kioskInitializedRef = useRef(false);

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
	const handleLayout = useCallback(
		(size: ScreenSize) => {
			stageSizeRef.current = size;
			session.setScreen({ ...size, corners: corners ?? undefined });
			if (kioskInitializedRef.current) return;
			kioskInitializedRef.current = true;
			session.startKiosk();
		},
		[session, corners],
	);
	useEffect(() => {
		const size = stageSizeRef.current;
		if (size) session.setScreen({ ...size, corners: corners ?? undefined });
	}, [session, corners]);

	// The stage fades out while the kiosk is halted under the settle bowl or the speed view
	const stageOpacity = useSharedValue(1);

	// What a step does to the game, straight away or once its flood covers the screen
	const perform = useCallback(
		(action: FlowAction) => {
			switch (action.kind) {
				case "play":
					// A game started from the bowl shows at once as its flood lifts
					stageOpacity.set(1);
					session.start(action.color);
					detectGyro();
					return;
				case "pause":
					session.pause();
					return;
				case "resume":
					session.resume();
					return;
				case "kiosk":
					session.startKiosk();
					return;
				case "haltKiosk":
					session.halt();
					stageOpacity.set(withTiming(0, { duration: 300 }));
					return;
				case "runKiosk":
					stageOpacity.set(withTiming(1, { duration: 400 }));
					session.run();
					return;
			}
		},
		[session, detectGyro, stageOpacity],
	);

	const { screen, dispatch } = useScreenFlow(store, {
		perform,
		flood: (color, at, onCovered) => flood.run(color, at.x, at.y, onCovered),
		calibrate: (zero, facingDown) => void calibrateTilt(zero, store, storage, facingDown),
	});

	// Colour wash, frost, shake and bursts react to the store; the flood is the transition
	const { accent, frost, shake, bursts, burstClock } = useStageEffects(
		store,
		phase,
		playerColor,
		fieldFrosted(phase, screen),
	);

	useAutoStart(autoStart, dispatch);
	useBenchStats(autoStart !== undefined);

	// The corner dot does what it shows; the flow decides what that is on this screen
	const corner = cornerDot(screen);
	const handleCorner = useCallback(
		() => dispatch({ type: "cornerPressed", tiltAvailable: tilt.available.get() }),
		[dispatch, tilt],
	);

	// Leaving the app mid-run or in Get ready lands on the pause screen when the player comes back
	const handleAppLeave = useEffectEvent(() => dispatch({ type: "appLeft" }));
	useEffect(() => bindAppLeave(watchAppActive, () => handleAppLeave()), [watchAppActive]);

	const handleStartPress = useCallback(
		(at: PressPoint, color: string) =>
			dispatch({
				type: "startPressed",
				color,
				hasZero: store.getState().settings.tiltZero !== null,
				at,
			}),
		[dispatch, store],
	);
	const handleCalibratePress = useCallback(
		() => dispatch({ type: "levelPressed", from: "pause", color: playerColor }),
		[dispatch, playerColor],
	);
	const handleMenuCalibratePress = useCallback(
		(color: string) => dispatch({ type: "levelPressed", from: "menu", color }),
		[dispatch],
	);
	const handleSettled = useCallback(
		(zero: TiltZero, facingDown: boolean, at: PressPoint) =>
			dispatch({ type: "settled", zero, facingDown, at }),
		[dispatch],
	);
	const handleSettleBack = useCallback(() => dispatch({ type: "settleBacked" }), [dispatch]);
	const handleSnap = useCallback(() => audio.playCollect(0), [audio]);
	// The ring closed on the dot: a snap, and play picks up at once
	const handleReady = useCallback(() => {
		handleSnap();
		dispatch({ type: "readyHeld" });
	}, [handleSnap, dispatch]);
	const handleSpeedPress = useCallback(
		() => dispatch({ type: "speedPressed", from: "pause", color: playerColor }),
		[dispatch, playerColor],
	);
	const handleMenuSpeedPress = useCallback(
		(color: string) => dispatch({ type: "speedPressed", from: "menu", color }),
		[dispatch],
	);
	const handleSpeedBack = useCallback(() => dispatch({ type: "speedBacked" }), [dispatch]);
	const handleRetryPress = useCallback(
		(at: PressPoint) => dispatch({ type: "retryPressed", color: playerColor, at }),
		[dispatch, playerColor],
	);
	const handleLeavePress = useCallback(
		(at: PressPoint) => dispatch({ type: "leavePressed", at }),
		[dispatch],
	);

	const { handleToggleSound, handleToggleMusic } = useSoundToggles(store, storage);
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
					accent={accent}
					stageOpacity={stageOpacity}
					shake={shake}
					bursts={bursts}
					burstClock={burstClock}
					onLayout={handleLayout}
					onDragDelta={devTouch ? (dx, dy) => session.feedDelta(dx, dy) : undefined}
				/>

				<FrostDim frost={frost} />

				{screen.kind === "getReady" && (
					<GetReadyOverlay
						scene={scene}
						color={playerColor}
						sensitivity={sensitivity}
						corners={corners}
						onReady={handleReady}
					/>
				)}

				<View style={[styles.inset, { paddingBottom: insets.bottom }]} pointerEvents="box-none">
					<View style={styles.stage} pointerEvents="box-none">
						{screen.kind === "title" && (
							<KioskOverlay
								highScore={highScore}
								soundEnabled={soundEnabled}
								musicEnabled={musicEnabled}
								onStart={handleStartPress}
								onCalibrate={handleMenuCalibratePress}
								onToggleSound={handleToggleSound}
								onToggleMusic={handleToggleMusic}
								sensitivity={sensitivity}
								onSpeed={handleMenuSpeedPress}
								versionTag={versionTag}
							/>
						)}

						{screen.kind === "pause" && (
							<PauseOverlay
								color={playerColor}
								onQuit={handleLeavePress}
								onCalibrate={handleCalibratePress}
								soundEnabled={soundEnabled}
								musicEnabled={musicEnabled}
								onToggleSound={handleToggleSound}
								onToggleMusic={handleToggleMusic}
								sensitivity={sensitivity}
								onSpeed={handleSpeedPress}
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
