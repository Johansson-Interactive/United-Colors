import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GameSession } from "./src/application/GameSession";
import { createGameStore } from "./src/application/GameStore";
import type { Corners } from "./src/domain/types";
import { AsyncStorageRepository } from "./src/infrastructure/AsyncStorageRepository";
import { AudioService } from "./src/infrastructure/AudioService";
import { DeviceMotionAdapter } from "./src/infrastructure/DeviceMotionAdapter";
import { loadDisplayCorners } from "./src/infrastructure/displayCorners";
import { FrameClock } from "./src/infrastructure/FrameClock";
import { HapticsService } from "./src/infrastructure/HapticsService";
import { isOtherAudioPlaying } from "./src/infrastructure/otherAudio";
import { watchAppActive, watchAppForeground } from "./src/infrastructure/watchAppActive";
import { GameScreen } from "./src/presentation/GameScreen";
import { TiltProvider } from "./src/presentation/tilt/TiltProvider";

const store = createGameStore();
const storage = new AsyncStorageRepository();

/** The game, driven by the display's frame clock */
const session = new GameSession({
	store,
	createClock: (onTick, onFrame) => new FrameClock(onTick, onFrame),
});

/** One device-motion source: the interface tilt owns it, the game listens to it */
const sensor = new DeviceMotionAdapter();

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
				/>
			</TiltProvider>
		</SafeAreaProvider>
	);
}
