// Reanimated's easings by their plain-JS path, so a test can run them without React Native
declare module "react-native-reanimated/lib/module/Easing" {
	export { Easing } from "react-native-reanimated/lib/typescript/Easing";
}
