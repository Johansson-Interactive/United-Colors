import type React from "react";
import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore } from "zustand";
import type { GameAudio } from "../application/GameAudio";
import type { GameHaptics } from "../application/GameHaptics";
import type { GameStore } from "../application/GameStore";
import { bindMusic } from "../application/useCases/BindMusic";
import { bindPauseOnLeave } from "../application/useCases/BindPauseOnLeave";
import { bindRejectHaptic } from "../application/useCases/BindRejectHaptic";
import { bindSoundSetting } from "../application/useCases/BindSoundSetting";
import { bindTiltZero } from "../application/useCases/BindTiltZero";
import { calibrateTilt } from "../application/useCases/CalibrateTilt";
import { handleGameOver } from "../application/useCases/GameOver";
import { loadHighScore } from "../application/useCases/LoadHighScore";
import { loadSettings } from "../application/useCases/LoadSettings";
import { pauseGame } from "../application/useCases/PauseGame";
import { resumeGame } from "../application/useCases/ResumeGame";
import { startGame } from "../application/useCases/StartGame";
import { updateSettings } from "../application/useCases/UpdateSettings";
import type { ScreenSize, SensorPort, SensorSample, StoragePort, TiltZero } from "../domain/types";
import { watchAppActive } from "../infrastructure/watchAppActive";
import { AmbientBackground } from "./components/AmbientBackground";
import type { PressPoint } from "./components/DotButton";
import { HUD } from "./components/HUD";
import { Bursts } from "./effects/Bursts";
import { FloodOverlay, useFlood } from "./effects/Flood";
import { FrostDim } from "./effects/FrostDim";
import { GameCanvas } from "./GameCanvas";
import { useDevControlMode } from "./hooks/useDevControlMode";
import { useGameLoop } from "./hooks/useGameLoop";
import { useStageEffects } from "./hooks/useStageEffects";
import { GameOverOverlay } from "./overlays/GameOverOverlay";
import { KioskOverlay } from "./overlays/KioskOverlay";
import { PauseOverlay } from "./overlays/PauseOverlay";
import { SettleOverlay } from "./overlays/SettleOverlay";
import { INK, INK_LIFT, WHITE } from "./theme/theme";
import { useTilt } from "./tilt/TiltProvider";
import { NO_ZERO } from "./tilt/tiltZero";

/**
 * The settle bowl is open: where play continues afterwards, the colour of the dot that settles,
 * and the level pose it replaces
 */
interface SettleRequest {
	from: "start" | "pause" | "menu";
	color: string;
	zero: TiltZero | null;
}

interface GameScreenProps {
	store: GameStore;
	storage: StoragePort;
	audio: GameAudio;
	haptics: GameHaptics;
	/** Shared with the interface tilt, which starts and stops it; the game only listens */
	sensor: SensorPort;
}

export const GameScreen: React.FC<GameScreenProps> = ({
	store,
	storage,
	audio,
	haptics,
	sensor,
}) => {
	const insets = useSafeAreaInsets();
	const tilt = useTilt();
	// Subscribe to phase/score only: dot positions never go through React
	const phase = useStore(store, (s) => s.frame.phase);
	const score = useStore(store, (s) => s.frame.score);
	const highScore = useStore(store, (s) => s.highScore);
	const soundEnabled = useStore(store, (s) => s.settings.soundEnabled);
	const musicEnabled = useStore(store, (s) => s.settings.musicEnabled);
	const playerColor = useStore(
		store,
		(s) => s.frame.dots.find((d) => d.kind === "player")?.color ?? WHITE,
	);
	const kioskInitializedRef = useRef(false);

	const flood = useFlood();
	const [previousBest, setPreviousBest] = useState(0);
	const [settle, setSettle] = useState<SettleRequest | null>(null);

	// Dev only: prefer gyro, fall back to touch drag when gyro is missing (e.g. simulator)
	const { touch: devTouch, detectGyro, onGyroSample } = useDevControlMode();

	const { scene, getEngine, peekEngine, setScreen, drawScene, startClock, stopClock } = useGameLoop(
		store,
		audio,
	);

	// Colour wash, frost, shake and bursts react to the store and engine; the flood is the transition
	const { accent, frost, shakeStyle, bursts } = useStageEffects(
		store,
		getEngine,
		phase,
		playerColor,
	);

	// Sounds load with the screen, follow the music and effect settings, and the music follows the phase;
	// dispose discards a load in flight
	useEffect(() => {
		void audio.load();
		const unbindSound = bindSoundSetting(store, audio);
		const unbindMusic = bindMusic(store, audio);
		return () => {
			unbindMusic();
			unbindSound();
			audio.dispose();
		};
	}, [audio, store]);

	// A buzz as the player spits out a wrong-colour dot
	useEffect(() => bindRejectHaptic(store, haptics), [store, haptics]);

	// Restore persisted settings and high score
	useEffect(() => {
		void loadSettings(store, storage);
		void loadHighScore(store, storage);
	}, [store, storage]);

	// The level pose reaches the engine and the interface together, so the dot in the game and
	// the dots on the menus rest in the same hand position
	useEffect(
		() =>
			bindTiltZero(store, (zero: TiltZero | null, zeroDown: TiltZero | null) => {
				getEngine().setTiltZero(zero, zeroDown);
				tilt.zero.set(zero ?? NO_ZERO);
				tilt.zeroDown.set(zeroDown ?? NO_ZERO);
			}),
		[getEngine, tilt, store],
	);

	// Reads the latest control mode without resubscribing the sensor when it changes
	const handleSensorSample = useEffectEvent((sample: SensorSample) => {
		// Dev: skip feeding the engine while touch is active
		if (devTouch) return;
		onGyroSample();
		peekEngine()?.onSensorInput(sample.x, sample.y, sample.facingDown);
	});

	// Samples arrive on every screen; the engine only moves the player while a game runs
	useEffect(() => sensor.onSample((sample) => handleSensorSample(sample)), [sensor]);

	// Watch for game over
	useEffect(() => {
		if (phase === "GAME_OVER") {
			stopClock();
			handleGameOver(getEngine(), store, storage);
		}
	}, [phase, getEngine, stopClock, store, storage]);

	const handleLayout = useCallback(
		(size: ScreenSize) => {
			setScreen(size);
			if (kioskInitializedRef.current) return;
			kioskInitializedRef.current = true;
			const engine = getEngine();
			engine.startKiosk();
			store.getState().updateFrame(engine.getFrame());
			startClock();
		},
		[getEngine, setScreen, startClock, store],
	);

	const handleStart = useCallback(
		(color: string) => {
			setPreviousBest(store.getState().highScore);
			const engine = getEngine();
			startGame(engine, store, color);
			detectGyro();
			startClock();
		},
		[getEngine, startClock, detectGyro, store],
	);

	const handlePause = useCallback(() => {
		// A refusal plays out to the game over; only a running game pauses
		if (store.getState().frame.phase !== "RUNNING") return;
		stopClock();
		pauseGame(getEngine(), store);
		// Frozen at tick positions; resume restarts at alpha 0, so no jump
		drawScene(0);
	}, [getEngine, stopClock, drawScene, store]);

	// Leaving the app mid-run lands on the pause screen when the player comes back
	useEffect(() => bindPauseOnLeave(store, watchAppActive, handlePause), [handlePause, store]);

	const handleResume = useCallback(() => {
		resumeGame(getEngine(), store);
		startClock();
	}, [getEngine, startClock, store]);

	const handleBack = useCallback(() => {
		const engine = getEngine();
		engine.startKiosk();
		store.getState().updateFrame(engine.getFrame());
		startClock();
	}, [getEngine, startClock, store]);

	// Transitions: a dot grows from under the finger, the scene changes, and it lifts.
	// A first game starts by setting the level pose; the settled dot then floods into play.
	// The level pose for the side the screen faces now, which a new settle replaces
	const currentZero = useCallback(() => {
		const { settings } = store.getState();
		return tilt.raw.facingDown.get() ? settings.tiltZeroDown : settings.tiltZero;
	}, [tilt, store]);
	const handleStartPress = useCallback(
		(point: PressPoint, color: string) => {
			if (store.getState().settings.tiltZero) {
				flood.run(color, point.x, point.y, () => handleStart(color));
			} else {
				setSettle({ from: "start", color, zero: null });
			}
		},
		[flood, handleStart, store],
	);
	const handleCalibratePress = useCallback(() => {
		setSettle({ from: "pause", color: playerColor, zero: currentZero() });
	}, [playerColor, currentZero]);
	const handleMenuCalibratePress = useCallback(
		(color: string) => {
			setSettle({ from: "menu", color, zero: currentZero() });
		},
		[currentZero],
	);
	const handleSettled = useCallback(
		(zero: TiltZero, facingDown: boolean, point: PressPoint) => {
			if (!settle) return;
			void calibrateTilt(zero, store, storage, facingDown);
			// From the title the pose is only saved; the title comes straight back
			if (settle.from === "menu") {
				setSettle(null);
				return;
			}
			const next = settle.from === "start" ? () => handleStart(settle.color) : handleResume;
			flood.run(settle.color, point.x, point.y, () => {
				setSettle(null);
				next();
			});
		},
		[settle, flood, handleStart, handleResume, store, storage],
	);
	const handleSettleBack = useCallback(() => setSettle(null), []);
	const handleSettleSnap = useCallback(() => audio.playCollect(), [audio]);
	const handleRetryPress = useCallback(
		(point: PressPoint) => flood.run(playerColor, point.x, point.y, () => handleStart(playerColor)),
		[flood, playerColor, handleStart],
	);
	const handleBackPress = useCallback(
		(point: PressPoint) => flood.run(INK_LIFT, point.x, point.y, handleBack),
		[flood, handleBack],
	);
	const handleQuitPress = useCallback(
		(point: PressPoint) => flood.run(INK_LIFT, point.x, point.y, handleBack),
		[flood, handleBack],
	);

	const handleToggleSound = useCallback(() => {
		const settings = store.getState().settings;
		void updateSettings({ ...settings, soundEnabled: !settings.soundEnabled }, store, storage);
	}, [store, storage]);
	const handleToggleMusic = useCallback(() => {
		const settings = store.getState().settings;
		void updateSettings({ ...settings, musicEnabled: !settings.musicEnabled }, store, storage);
	}, [store, storage]);

	// The playfield keeps clear of the top inset (notch / Dynamic Island) and side insets but
	// runs under the home indicator, as before; the interface layer also respects the bottom
	const stageInsets = {
		paddingTop: insets.top,
		paddingLeft: insets.left,
		paddingRight: insets.right,
	};
	const uiInsets = { ...stageInsets, paddingBottom: insets.bottom };

	return (
		<View style={styles.container}>
			<AmbientBackground accent={accent} frost={frost} />

			<View style={[styles.inset, stageInsets]}>
				<Animated.View style={[styles.stage, shakeStyle]}>
					<GameCanvas
						scene={scene}
						frost={frost}
						onLayout={handleLayout}
						onDragDelta={
							devTouch
								? (dx, dy) => {
										// Rendered on the next frame
										peekEngine()?.onMovementDelta(dx, dy);
									}
								: undefined
						}
					/>
					<Bursts bursts={bursts} />
				</Animated.View>
			</View>

			<FrostDim frost={frost} />

			<View style={[styles.inset, uiInsets]} pointerEvents="box-none">
				<View style={styles.stage} pointerEvents="box-none">
					{(phase === "RUNNING" || phase === "REJECTING") && (
						<HUD score={score} color={playerColor} onPause={handlePause} />
					)}

					{phase === "KIOSK" && !settle && (
						<KioskOverlay
							highScore={highScore}
							soundEnabled={soundEnabled}
							musicEnabled={musicEnabled}
							onStart={handleStartPress}
							onCalibrate={handleMenuCalibratePress}
							onToggleSound={handleToggleSound}
							onToggleMusic={handleToggleMusic}
						/>
					)}

					{phase === "PAUSED" && !settle && (
						<PauseOverlay
							color={playerColor}
							onResume={handleResume}
							onQuit={handleQuitPress}
							onCalibrate={handleCalibratePress}
							soundEnabled={soundEnabled}
							musicEnabled={musicEnabled}
							onToggleSound={handleToggleSound}
							onToggleMusic={handleToggleMusic}
						/>
					)}

					{settle && (
						<SettleOverlay
							color={settle.color}
							zero={settle.zero}
							onSettled={handleSettled}
							onBack={handleSettleBack}
							onSnap={handleSettleSnap}
						/>
					)}

					{phase === "GAME_OVER" && (
						<GameOverOverlay
							score={score}
							previousBest={previousBest}
							color={playerColor}
							onRetry={handleRetryPress}
							onBack={handleBackPress}
						/>
					)}
				</View>
			</View>

			<FloodOverlay flood={flood} />
		</View>
	);
};

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: INK,
	},
	inset: {
		...StyleSheet.absoluteFill,
	},
	stage: {
		flex: 1,
	},
});
