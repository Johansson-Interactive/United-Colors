import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { type BenchRun, benchSessionOptions, benchTilt } from "./src/application/bench";
import { GameSession } from "./src/application/GameSession";
import { createGameStore } from "./src/application/GameStore";
import { bindScreenAwake } from "./src/application/useCases/BindScreenAwake";
import type { Corners } from "./src/domain/types";
import { AsyncStorageRepository } from "./src/infrastructure/AsyncStorageRepository";
import { AudioService } from "./src/infrastructure/AudioService";
import { DeviceMotionAdapter } from "./src/infrastructure/DeviceMotionAdapter";
import { loadDisplayCorners } from "./src/infrastructure/displayCorners";
import { FrameClock } from "./src/infrastructure/FrameClock";
import { HapticsService } from "./src/infrastructure/HapticsService";
import { KeepAwakeService } from "./src/infrastructure/KeepAwakeService";
import { isOtherAudioPlaying } from "./src/infrastructure/otherAudio";
import { startPerformanceHint } from "./src/infrastructure/performanceHint";
import { ScriptedTiltSensor } from "./src/infrastructure/ScriptedTiltSensor";
import { watchAppActive, watchAppForeground } from "./src/infrastructure/watchAppActive";
import { GameScreen } from "./src/presentation/GameScreen";
import { TiltProvider } from "./src/presentation/tilt/TiltProvider";

/**
 * A bench build (built with EXPO_PUBLIC_BENCH=1, or =drips for the run that keeps drips on the
 * walls) plays the bench run by itself on launch, for performance traces of play (see
 * src/application/bench.ts); shipped builds never set it
 */
const BENCH_FLAG = process.env.EXPO_PUBLIC_BENCH;
const BENCH = BENCH_FLAG === "1" || BENCH_FLAG === "drips";
const BENCH_RUN: BenchRun = BENCH_FLAG === "drips" ? "drips" : "steady";
const BENCH_COLOR = "#E91E63";

const store = createGameStore();
const storage = new AsyncStorageRepository();

/** The game, driven by the display's frame clock */
const session = new GameSession({
	store,
	createClock: (onTick, onFrame) => new FrameClock(onTick, onFrame),
	...(BENCH ? benchSessionOptions(BENCH_RUN) : {}),
});

/**
 * One device-motion source: the interface tilt owns it, the game listens to it. The bench run
 * steers with a scripted tilt instead.
 */
const sensor = BENCH ? new ScriptedTiltSensor(benchTilt) : new DeviceMotionAdapter();

const audio = new AudioService(
	{
		collect: require("./assets/sounds/collect-small.m4a"),
		collectLarge: require("./assets/sounds/collect-large.m4a"),
		pointSpawn: require("./assets/sounds/point-spawn.m4a"),
		gameOver: require("./assets/music/game-over.m4a"),
	},
	{
		menu: require("./assets/music/menu.m4a"),
		game: require("./assets/music/game.m4a"),
	},
	{ os: Platform.OS, isOtherAudioPlaying, watchForeground: watchAppForeground },
);

const haptics = new HapticsService();

/** Tilting is no touch, so keep the screen from dimming mid-run; bound for the app's lifetime */
bindScreenAwake(store, new KeepAwakeService());

/** How the glass rounds its corners, asked for once at launch */
const displayCorners = loadDisplayCorners(Platform.OS);

/** Keep the frame work on cores fast enough for it (Android; a tilt game gets no touch boost) */
void startPerformanceHint(Platform.OS);

export default function App() {
	const [corners, setCorners] = useState<Corners | null>(null);
	useEffect(() => {
		void displayCorners.then(setCorners);
	}, []);

	return (
		<SafeAreaProvider>
			<StatusBar style="light" hidden />
			<TiltProvider sensor={sensor}>
				<GameScreen
					session={session}
					store={store}
					storage={storage}
					audio={audio}
					haptics={haptics}
					sensor={sensor}
					watchAppActive={watchAppActive}
					corners={corners}
					autoStart={BENCH ? BENCH_COLOR : undefined}
				/>
			</TiltProvider>
		</SafeAreaProvider>
	);
}
