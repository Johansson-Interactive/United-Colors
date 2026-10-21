import type React from "react";
import type { MenuOpening } from "../flow/screenFlow";
import { CORNER_INSET, WHITE } from "../theme/theme";
import { sensitivityChoice } from "../tilt/sensitivity";
import { useCornerMenus } from "./CornerMenusProvider";
import { DotMenu } from "./DotMenu";

interface SettingsMenuProps {
	/**
	 * Called at the tap: returns where the tap came from and, on the title, the colour the play
	 * dot shows then, which the level bowl or the speed view opens in
	 */
	openingAt: () => MenuOpening;
	/** Glyph colour of the settings and speed dots */
	color?: string;
}

/**
 * The settings corner (bottom left), mirroring the sound corner: the settings dot opens into
 * the level dot, nearest it, and the speed dot above, each opening its own view
 */
export const SettingsMenu: React.FC<SettingsMenuProps> = ({ openingAt, color = WHITE }) => {
	const { sensitivity, openLevel, openSpeed } = useCornerMenus();
	const speed = sensitivityChoice(sensitivity);
	return (
		<DotMenu
			icon="settings"
			label="Settings"
			closeLabel="Close settings"
			color={color}
			corner={{ left: CORNER_INSET }}
			items={[
				{
					key: "speed",
					icon: `speed-${speed.key}`,
					onPress: () => openSpeed(openingAt()),
					label: `Tilt speed, ${speed.label.toLowerCase()}`,
				},
				{
					key: "level",
					icon: "level",
					onPress: () => openLevel(openingAt()),
					label: "Set level pose",
				},
			]}
		/>
	);
};
