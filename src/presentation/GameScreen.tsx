import type React from "react";
import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";
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
import { handleGameOver } from "../application/useCases/GameOver";
import { loadHighScore } from "../application/useCases/LoadHighScore";
import { loadSettings } from "../application/useCases/LoadSettings";
import type { ScreenSize, TiltZero } from "../domain/types";
import { AmbientBackground } from "./components/AmbientBackground";
import type { PressPoint } from "./components/DotButton";
import { HUD } from "./components/HUD";
import { Bursts } from "./effects/Bursts";
import { FloodOverlay, useFlood } from "./effects/Flood";
import { FrostDim } from "./effects/FrostDim";
import {
	type FlowAction,
	type FlowEvent,
	type FlowState,
	type FlowStep,
	INITIAL_FLOW,
	kioskQuiet,
	stepFlow,
} from "./flow/screenFlow";
import { GameCanvas } from "./GameCanvas";
import { useDevControlMode } from "./hooks/useDevControlMode";
import { useQuietKiosk } from "./hooks/useQuietKiosk";
import { useSensitivitySetting } from "./hooks/useSensitivitySetting";
import { useSessionScene } from "./hooks/useSessionScene";
import { useSoundToggles } from "./hooks/useSoundToggles";
import { useStageEffects } from "./hooks/useStageEffects";
import { GameOverOverlay } from "./overlays/GameOverOverlay";
import { KioskOverlay } from "./overlays/KioskOverlay";
import { PauseOverlay } from "./overlays/PauseOverlay";
import { SettleOverlay } from "./overlays/SettleOverlay";
import { SpeedOverlay } from "./overlays/SpeedOverlay";
import { INK, WHITE } from "./theme/theme";
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
}

export const GameScreen: React.FC<GameScreenProps> = ({
	session,
	store,
	storage,
	audio,
	haptics,
	sensor,
	watchAppActive,
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
	const scene = useSessionScene(session);

	// Dev only: prefer gyro, fall back to touch drag when gyro is missing (e.g. simulator)
	const { touch: devTouch, detectGyro, onGyroSample } = useDevControlMode();

	// Colour wash, frost, shake and bursts react to the store; the flood is the transition
	const { accent, frost, shakeStyle, bursts } = useStageEffects(store, phase, playerColor);

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

	// The session has halted itself; the score is in the final frame
	useEffect(() => {
		if (phase === "GAME_OVER") void handleGameOver(store, storage);
	}, [phase, store, storage]);

	const handleLayout = useCallback(
		(size: ScreenSize) => {
			session.setScreen(size);
			if (kioskInitializedRef.current) return;
			kioskInitializedRef.current = true;
			session.startKiosk();
		},
		[session],
	);

	const handlePause = useCallback(() => {
		session.pause();
	}, [session]);

	// Leaving the app mid-run lands on the pause screen when the player comes back
	useEffect(
		() => bindPauseOnLeave(store, watchAppActive, handlePause),
		[handlePause, store, watchAppActive],
	);

	const handleResume = useCallback(() => session.resume(), [session]);

	// What a flood does to the game once it covers the screen
	const perform = useCallback(
		(action: FlowAction) => {
			switch (action.kind) {
				case "play":
					setPreviousBest(store.getState().highScore);
					session.start(action.color);
					detectGyro();
					return;
				case "resume":
					session.resume();
					return;
				case "kiosk":
					session.startKiosk();
					return;
			}
		},
		[session, store, detectGyro],
	);

	// The screens and the floods between them (see screenFlow.ts); each step may save a level
	// pose and may start a flood, which changes the scene once it covers the screen
	const [flow, setFlow] = useState<FlowState>(INITIAL_FLOW);
	const flowRef = useRef<FlowState>(INITIAL_FLOW);
	const dispatch = useCallback(
		(event: FlowEvent) => {
			const apply = (next: FlowEvent): FlowStep => {
				const step = stepFlow(flowRef.current, next);
				flowRef.current = step.state;
				setFlow(step.state);
				return step;
			};
			const step = apply(event);
			if (step.calibrate) {
				void calibrateTilt(step.calibrate.zero, store, storage, step.calibrate.facingDown);
			}
			if (step.flood) {
				const { color, at, action } = step.flood;
				flood.run(color, at.x, at.y, () => {
					apply({ type: "covered" });
					perform(action);
				});
			}
		},
		[flood, perform, store, storage],
	);

	// Levelling from the title stops and hides the kiosk
	const stageFadeStyle = useQuietKiosk(kioskQuiet(flow), store, session);

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
	const handleSettleSnap = useCallback(() => audio.playCollect(), [audio]);
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

	const settle = flow.settle;
	const speedView = flow.speed;

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

			<Animated.View style={[styles.inset, stageInsets, stageFadeStyle]}>
				<Animated.View style={[styles.stage, shakeStyle]}>
					<GameCanvas
						scene={scene}
						frost={frost}
						onLayout={handleLayout}
						onDragDelta={devTouch ? (dx, dy) => session.feedDelta(dx, dy) : undefined}
					/>
					<Bursts bursts={bursts} />
				</Animated.View>
			</Animated.View>

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
							sensitivity={sensitivity}
						/>
					)}

					{phase === "PAUSED" && !settle && !speedView && (
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

					{phase === "PAUSED" && speedView && (
						<SpeedOverlay
							color={speedView.color}
							sensitivity={sensitivity}
							onSelect={setSensitivity}
							onBack={handleSpeedBack}
						/>
					)}

					{settle && (
						<SettleOverlay
							color={settle.color}
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
							onBack={handleLeavePress}
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
