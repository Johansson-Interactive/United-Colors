module.exports = (api) => {
	api.cache(true);
	// babel-preset-expo adds the worklets plugin itself when react-native-worklets is installed
	return {
		// Resolve Expo's preset from Expo's dependencies for pnpm's isolated installs.
		presets: [
			require.resolve("babel-preset-expo", {
				paths: [require.resolve("expo/package.json")],
			}),
		],
	};
};
