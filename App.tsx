import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { type BenchRun, benchSessionOptions, benchTilt } from "./src/application/bench";
import { GameSession } from "./src/application/GameSession";
import { createGameStore } from "./src/application/GameStore";
import { createPilot } from "./src/application/pilot";
import { TiltSource } from "./src/application/TiltSource";
import { bindPersonalBest } from "./src/application/useCases/BindPersonalBest";
import { bindRunInPlay } from "./src/application/useCases/BindRunInPlay";
import type { Corners } from "./src/domain/types";
import { AsyncStorageRepository } from "./src/infrastructure/AsyncStorageRepository";
import { AudioService } from "./src/infrastructure/AudioService";
import { loadBuildInfo } from "./src/infrastructure/buildInfo";
import { DeviceMotionAdapter } from "./src/infrastructure/DeviceMotionAdapter";
import { DisplayRateService } from "./src/infrastructure/DisplayRateService";
import { loadDisplayCorners } from "./src/infrastructure/displayCorners";
import { FrameClock } from "./src/infrastructure/FrameClock";
import { HapticsService } from "./src/infrastructure/HapticsService";
import { KeepAwakeService } from "./src/infrastructure/KeepAwakeService";
import { isOtherAudioPlaying } from "./src/infrastructure/otherAudio";
import { ScriptedTiltSensor } from "./src/infrastructure/ScriptedTiltSensor";
import { pinMainThreadToFastCores } from "./src/infrastructure/threadAffinity";
import { watchAppActive, watchAppForeground } from "./src/infrastructure/watchAppActive";
import { GameScreen } from "./src/presentation/GameScreen";
import { MotionProbe } from "./src/presentation/probe/MotionProbe";
import { TiltProvider } from "./src/presentation/tilt/TiltProvider";
import { versionTag } from "./src/presentation/versionTag";

/**
 * A bench build (built with EXPO_PUBLIC_BENCH=1, or =drips for the run that keeps drips on the
 * walls) plays the bench run by itself on launch, for performance traces of play (see
 * src/application/bench.ts); shipped builds never set it
 */
const BENCH_FLAG = process.env.EXPO_PUBLIC_BENCH;
const BENCH = BENCH_FLAG === "1" || BENCH_FLAG === "drips";
const BENCH_RUN: BenchRun = BENCH_FLAG === "drips" ? "drips" : "steady";
const BENCH_COLOR = "#E91E63";
/**
 * A capture build (built with EXPO_PUBLIC_CAPTURE=1) is steered by the pilot instead of the
 * phone, so a simulator can play real runs for the store screenshots and the app preview (see
 * src/application/pilot.ts); shipped builds never set it
 */
const CAPTURE = process.env.EXPO_PUBLIC_CAPTURE === "1";
/**
 * A probe build (built with EXPO_PUBLIC_MOTION_PROBE=1) shows the phone's motion over the game,
 * to measure on a real phone how a turn on the spot differs from a wrist roll (see
 * src/presentation/probe/probeReadout.ts); shipped builds never set it
 */
const MOTION_PROBE = process.env.EXPO_PUBLIC_MOTION_PROBE === "1";

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
 * steers with a scripted tilt instead, and a capture build with the pilot's.
 */
const sensor = BENCH
	? new ScriptedTiltSensor(benchTilt)
	: CAPTURE
		? new ScriptedTiltSensor(
				createPilot(
					() => store.getState(),
					() => session.getScreen(),
				),
			)
		: new DeviceMotionAdapter(Platform.OS === "ios" ? "ios" : "android");

/** The tilt from the level pose in use, read once per sample for the interface and the game */
const tiltSource = new TiltSource(sensor, store);

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

/**
 * Tilting is no touch, so while a run is in play keep the screen from dimming and the display
 * at its fastest rate (Android); bound for the app's lifetime
 */
const keepAwake = new KeepAwakeService();
const displayRate = new DisplayRateService();
bindRunInPlay(store, (inPlay) => {
	keepAwake.setAwake(inPlay);
	displayRate.setFastest(inPlay);
});

/** Each game over is judged against the stored personal best; bound for the app's lifetime */
bindPersonalBest(store, storage);

/** Keep the frame work off the little cores (Android; a tilt game gets no touch boost) */
void pinMainThreadToFastCores();

/** The title's small print, from what the installed app reports of itself */
const VERSION_TAG = versionTag(loadBuildInfo());

/** How the glass rounds its corners, asked for once at launch */
const displayCorners = loadDisplayCorners(Platform.OS);

export default function App() {
	const [corners, setCorners] = useState<Corners | null>(null);
	useEffect(() => {
		void displayCorners.then(setCorners);
	}, []);

	return (
		<SafeAreaProvider>
			<StatusBar style="light" hidden />
			<TiltProvider source={tiltSource}>
				<GameScreen
					session={session}
					store={store}
					storage={storage}
					audio={audio}
					haptics={haptics}
					tiltSource={tiltSource}
					watchAppActive={watchAppActive}
					corners={corners}
					versionTag={VERSION_TAG}
					autoStart={BENCH ? BENCH_COLOR : undefined}
				/>
			</TiltProvider>
			{MOTION_PROBE && <MotionProbe sensor={sensor} />}
		</SafeAreaProvider>
	);
}
