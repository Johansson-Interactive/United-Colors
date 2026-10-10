import type React from "react";
import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore } from "zustand";
import type { GameAudio } from "../application/GameAudio";
import { createGameStore } from "../application/GameStore";
import { buildScene, type SceneDot } from "../application/renderScene";
import { bindMusic } from "../application/useCases/BindMusic";
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
import { GameEngine } from "../domain/engine/GameEngine";
import type { ScreenSize, SensorSample, TiltZero } from "../domain/types";
import { AsyncStorageRepository } from "../infrastructure/AsyncStorageRepository";
import { DeviceMotionAdapter } from "../infrastructure/DeviceMotionAdapter";
import { FrameClock } from "../infrastructure/FrameClock";
import { AmbientBackground } from "./components/AmbientBackground";
import type { PressPoint } from "./components/DotButton";
import { HUD } from "./components/HUD";
import { Bursts } from "./effects/Bursts";
import { FloodOverlay, useFlood } from "./effects/Flood";
import { FrostDim } from "./effects/FrostDim";
import { GameCanvas } from "./GameCanvas";
import { useStageEffects } from "./hooks/useStageEffects";
import { GameOverOverlay } from "./overlays/GameOverOverlay";
import { KioskOverlay } from "./overlays/KioskOverlay";
import { PauseOverlay } from "./overlays/PauseOverlay";
import { SettleOverlay } from "./overlays/SettleOverlay";
import { INK, INK_LIFT, WHITE } from "./theme/theme";
import { NO_ZERO, useTilt } from "./tilt/TiltProvider";

const DEFAULT_SCREEN: ScreenSize = { width: 400, height: 800 };
const DEFAULT_DENSITY = 400;

const store = createGameStore();
const storage = new AsyncStorageRepository();
const sensor = new DeviceMotionAdapter();

const isDev = typeof __DEV__ !== "undefined" && __DEV__;

/** Dev only: 'gyro' | 'touch' | 'pending' (waiting for first gyro sample or timeout) */
type DevControlMode = "gyro" | "touch" | "pending";

const GYRO_DETECT_MS = 800;

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
	audio: GameAudio;
}

export const GameScreen: React.FC<GameScreenProps> = ({ audio }) => {
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
	const scene = useSharedValue<SceneDot[]>([]);
	const engineRef = useRef<GameEngine | null>(null);
	const clockRef = useRef<FrameClock | null>(null);
	const kioskInitializedRef = useRef(false);
	const screenRef = useRef<ScreenSize>(DEFAULT_SCREEN);

	const flood = useFlood();
	const [previousBest, setPreviousBest] = useState(0);
	const [settle, setSettle] = useState<SettleRequest | null>(null);

	// Dev only: prefer gyro, fallback to touch when gyro not available (e.g. simulator)
	const [devControlMode, setDevControlMode] = useState<DevControlMode>("pending");
	const devGyroTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const getEngine = useCallback((): GameEngine => {
		if (!engineRef.current) {
			engineRef.current = new GameEngine({
				density: DEFAULT_DENSITY,
				screen: screenRef.current,
				audio,
			});
		}
		return engineRef.current;
	}, [audio]);

	// Colour wash, frost, shake and bursts react to the store and engine; the flood is the transition
	const { accent, frost, shakeStyle, bursts } = useStageEffects(
		store,
		getEngine,
		phase,
		playerColor,
	);

	/** Write the drawable scene for this rendered frame (alpha = fraction of a tick elapsed) */
	const drawScene = useCallback(
		(alpha: number) => {
			scene.set(buildScene(store.getState().frame, alpha, getEngine().getPlayerPosition()));
		},
		[getEngine, scene],
	);

	const startClock = useCallback(() => {
		if (clockRef.current) clockRef.current.stop();
		const engine = getEngine();
		clockRef.current = new FrameClock(
			() => {
				engine.tick();
				store.getState().updateFrame(engine.getFrame());
			},
			(dtMs, alpha) => {
				// Player moves and collides every rendered frame; other dots are extrapolated
				// between ticks. Drawn on the UI thread from the shared value -- no React render
				// per frame unless a collision changed score/phase.
				if (engine.advancePlayer(dtMs, alpha)) {
					store.getState().updateFrame(engine.getFrame());
				}
				drawScene(alpha);
			},
		);
		clockRef.current.start();
	}, [getEngine, drawScene]);

	const stopClock = useCallback(() => {
		clockRef.current?.stop();
	}, []);

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
	}, [audio]);

	// Restore persisted settings and high score
	useEffect(() => {
		void loadSettings(store, storage);
		void loadHighScore(store, storage);
	}, []);

	// The level pose reaches the engine and the interface together, so the dot in the game and
	// the dots on the menus rest in the same hand position
	useEffect(
		() =>
			bindTiltZero(store, (zero: TiltZero | null, zeroDown: TiltZero | null) => {
				getEngine().setTiltZero(zero, zeroDown);
				tilt.zero.set(zero ?? NO_ZERO);
				tilt.zeroDown.set(zeroDown ?? NO_ZERO);
			}),
		[getEngine, tilt],
	);

	// Reads the latest control mode without resubscribing the sensor when it changes
	const handleSensorSample = useEffectEvent((sample: SensorSample) => {
		// Dev: skip feeding the engine while touch is active
		if (isDev && devControlMode === "touch") return;
		// Dev: first gyro sample → prefer gyro, cancel touch fallback
		if (isDev) {
			if (devGyroTimeoutRef.current) {
				clearTimeout(devGyroTimeoutRef.current);
				devGyroTimeoutRef.current = null;
			}
			setDevControlMode((prev) => (prev === "pending" ? "gyro" : prev));
		}
		engineRef.current?.onSensorInput(sample.x, sample.y, sample.facingDown);
	});

	// Setup sensor
	useEffect(() => {
		sensor.onSample((sample) => handleSensorSample(sample));
		return () => {
			if (devGyroTimeoutRef.current) clearTimeout(devGyroTimeoutRef.current);
			sensor.stop();
			clockRef.current?.stop();
		};
	}, []);

	// Watch for game over
	useEffect(() => {
		if (phase === "GAME_OVER") {
			stopClock();
			sensor.stop();
			handleGameOver(getEngine(), store, storage);
		}
	}, [phase, getEngine, stopClock]);

	const handleLayout = useCallback(
		(size: ScreenSize) => {
			screenRef.current = size;
			engineRef.current?.setScreen(size);
			if (kioskInitializedRef.current) return;
			kioskInitializedRef.current = true;
			const engine = getEngine();
			engine.startKiosk();
			store.getState().updateFrame(engine.getFrame());
			startClock();
		},
		[getEngine, startClock],
	);

	const handleStart = useCallback(
		(color: string) => {
			setPreviousBest(store.getState().highScore);
			const engine = getEngine();
			startGame(engine, store, color);
			sensor.start();
			if (isDev) {
				setDevControlMode("pending");
				if (devGyroTimeoutRef.current) clearTimeout(devGyroTimeoutRef.current);
				devGyroTimeoutRef.current = setTimeout(() => {
					devGyroTimeoutRef.current = null;
					setDevControlMode((prev) => (prev === "pending" ? "touch" : prev));
				}, GYRO_DETECT_MS);
			}
			startClock();
		},
		[getEngine, startClock],
	);

	const handlePause = useCallback(() => {
		stopClock();
		sensor.stop();
		pauseGame(getEngine(), store);
		// Frozen at tick positions; resume restarts at alpha 0, so no jump
		drawScene(0);
	}, [getEngine, stopClock, drawScene]);

	const handleResume = useCallback(() => {
		resumeGame(getEngine(), store);
		sensor.start();
		startClock();
	}, [getEngine, startClock]);

	const handleBack = useCallback(() => {
		const engine = getEngine();
		engine.startKiosk();
		store.getState().updateFrame(engine.getFrame());
		startClock();
	}, [getEngine, startClock]);

	// Transitions: a dot grows from under the finger, the scene changes, and it lifts.
	// A first game starts by setting the level pose; the settled dot then floods into play.
	// The level pose for the side the screen faces now, which a new settle replaces
	const currentZero = useCallback(() => {
		const { settings } = store.getState();
		return tilt.raw.facingDown.get() ? settings.tiltZeroDown : settings.tiltZero;
	}, [tilt]);
	const handleStartPress = useCallback(
		(point: PressPoint, color: string) => {
			if (store.getState().settings.tiltZero) {
				flood.run(color, point.x, point.y, () => handleStart(color));
			} else {
				setSettle({ from: "start", color, zero: null });
			}
		},
		[flood, handleStart],
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
		[settle, flood, handleStart, handleResume],
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
	}, []);
	const handleToggleMusic = useCallback(() => {
		const settings = store.getState().settings;
		void updateSettings({ ...settings, musicEnabled: !settings.musicEnabled }, store, storage);
	}, []);

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
							isDev && devControlMode === "touch"
								? (dx, dy) => {
										// Rendered on the next frame
										engineRef.current?.onMovementDelta(dx, dy);
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
					{phase === "RUNNING" && <HUD score={score} color={playerColor} onPause={handlePause} />}

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
