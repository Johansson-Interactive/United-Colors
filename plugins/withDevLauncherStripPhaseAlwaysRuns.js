// expo-dev-launcher adds a build phase that edits the built Info.plist but declares no
// inputs or outputs, so Xcode warns that it runs on every build. Running every build is
// what it needs, so mark it alwaysOutOfDate (unchecks "Based on dependency analysis").
const { withXcodeProject } = require("expo/config-plugins");

const PHASE_NAME = "[Expo Dev Launcher] Strip Local Network Keys for Release";

module.exports = (config) =>
	withXcodeProject(config, (config) => {
		const phases = config.modResults.hash.project.objects.PBXShellScriptBuildPhase ?? {};
		for (const phase of Object.values(phases)) {
			if (typeof phase === "object" && phase.name?.replaceAll('"', "") === PHASE_NAME) {
				phase.alwaysOutOfDate = 1;
			}
		}
		return config;
	});
