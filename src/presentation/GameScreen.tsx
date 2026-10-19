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
import { bindHaptics } from "../application/useCases/BindHaptics";
import { bindMusic } from "../application/useCases/BindMusic";
import { bindPauseOnLeave } from "../application/useCases/BindPauseOnLeave";
import { bindSoundEffects } from "../application/useCases/BindSoundEffects";
import { bindSoundSetting } from "../application/useCases/BindSoundSetting";
import { bindTiltZero } from "../application/useCases/BindTiltZero";
import { calibrateTilt } from "../application/useCases/CalibrateTilt";
import { loadHighScore } from "../application/useCases/LoadHighScore";
import { loadSettings } from "../application/useCases/LoadSettings";
import type { Corners, ScreenSize, TiltZero } from "../domain/types";
import type { PressPoint } from "./components/DotButton";
import { HUD } from "./components/HUD";
import { FloodOverlay, useFlood } from "./effects/Flood";
import { FrostDim } from "./effects/FrostDim";
import type { FlowAction } from "./flow/screenFlow";
import { GameCanvas } from "./GameCanvas";
import { useAutoStart } from "./hooks/useAutoStart";
import { useBenchStats } from "./hooks/useBenchStats";
import { useDevControlMode } from "./hooks/useDevControlMode";
import { useScreenFlow } from "./hooks/useScreenFlow";
import { useSensitivitySetting } from "./hooks/useSensitivitySetting";
import { useSessionScene } from "./hooks/useSessionScene";
import { useSoundToggles } from "./hooks/useSoundToggles";
import { useStageEffects } from "./hooks/useStageEffects";
import { StageFrame } from "./layout/StageFrame";
import { GameOverOverlay } from "./overlays/GameOverOverlay";
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

	// Colour wash, frost, shake and bursts react to the store; the flood is the transition
	const { accent, frost, shake, bursts, burstClock } = useStageEffects(store, phase, playerColor);

	// Sounds load with the screen and follow the music and effect settings; the effects follow
	// the game's events and the music the phase. Dispose discards a load in flight.
	useEffect(() => {
		void audio.load();
		const unbindSetting = bindSoundSetting(store, audio);
		const unbindEffects = bindSoundEffects(store, audio);
		const unbindMusic = bindMusic(store, audio);
		return () => {
			unbindMusic();
			unbindEffects();
			unbindSetting();
			audio.dispose();
		};
	}, [audio, store]);

	// A buzz as the player spits out a wrong-colour dot
	useEffect(() => bindHaptics(store, haptics), [store, haptics]);

	// Restore persisted settings and high score
	useEffect(() => {
		void loadSettings(store, storage);
		void loadHighScore(store, storage);
	}, [store, storage]);

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

	// The stage fades out while the kiosk is halted under the settle bowl
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

	useAutoStart(autoStart, dispatch);
	useBenchStats(autoStart !== undefined);

	const handlePause = useCallback(() => dispatch({ type: "pausePressed" }), [dispatch]);

	// Leaving the app mid-run lands on the pause screen when the player comes back
	const pauseOnLeave = useEffectEvent(() => dispatch({ type: "pausePressed" }));
	useEffect(
		() => bindPauseOnLeave(store, watchAppActive, () => pauseOnLeave()),
		[store, watchAppActive],
	);

	const handleResume = useCallback(() => dispatch({ type: "resumePressed" }), [dispatch]);

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
	const handleSettleSnap = useCallback(() => audio.playCollect(0), [audio]);
	const handleSpeedPress = useCallback(
		() => dispatch({ type: "speedPressed", color: playerColor }),
		[dispatch, playerColor],
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

				<View style={[styles.inset, { paddingBottom: insets.bottom }]} pointerEvents="box-none">
					<View style={styles.stage} pointerEvents="box-none">
						{screen.kind === "hud" && (
							<HUD store={store} color={playerColor} onPause={handlePause} corners={corners} />
						)}

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
								versionTag={versionTag}
							/>
						)}

						{screen.kind === "pause" && (
							<PauseOverlay
								color={playerColor}
								onResume={handleResume}
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
								onSnap={handleSettleSnap}
							/>
						)}

						{screen.kind === "gameOver" && (
							<GameOverOverlay
								store={store}
								color={playerColor}
								onRetry={handleRetryPress}
								onBack={handleLeavePress}
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
