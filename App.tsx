import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AudioService } from "./src/infrastructure/AudioService";
import { DeviceMotionAdapter } from "./src/infrastructure/DeviceMotionAdapter";
import { GameScreen } from "./src/presentation/GameScreen";
import { TiltProvider } from "./src/presentation/tilt/TiltProvider";

/** One device-motion source: the interface tilt owns it, the game listens to it */
const sensor = new DeviceMotionAdapter();

const audio = new AudioService(
	{
		collect: require("./assets/sounds/collect-small.m4a"),
		collectLarge: require("./assets/sounds/collect-large.m4a"),
		pointSpawn: require("./assets/sounds/jump.ogg"),
		gameOver: require("./assets/music/game-over.m4a"),
	},
	{
		menu: require("./assets/music/menu.m4a"),
		game: require("./assets/music/game.m4a"),
	},
);

export default function App() {
	return (
		<SafeAreaProvider>
			<StatusBar style="light" hidden />
			<TiltProvider sensor={sensor}>
				<GameScreen audio={audio} sensor={sensor} />
			</TiltProvider>
		</SafeAreaProvider>
	);
}
