import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { DeviceMotionAdapter } from "./src/infrastructure/DeviceMotionAdapter";
import { GameScreen } from "./src/presentation/GameScreen";
import { TiltProvider } from "./src/presentation/tilt/TiltProvider";

/** Device tilt for the interface, separate from the game's own sensor subscription */
const uiTilt = new DeviceMotionAdapter();

export default function App() {
	return (
		<SafeAreaProvider>
			<StatusBar style="light" hidden />
			<TiltProvider sensor={uiTilt}>
				<GameScreen />
			</TiltProvider>
		</SafeAreaProvider>
	);
}
