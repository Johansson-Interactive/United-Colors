import type React from "react";
import { CORNER_INSET, WHITE } from "../theme/theme";
import { sensitivityChoice } from "../tilt/sensitivity";
import { type MenuOpening, useCornerMenus } from "./CornerMenusProvider";
import { DotMenu } from "./DotMenu";

interface SettingsMenuProps {
	/**
	 * Where the menu sits, asked at the tap, so on the title it carries the colour the play dot
	 * shows then; the level bowl and the speed view open from there
	 */
	opening: () => MenuOpening;
	/** Glyph colour of the level dot, the colour its bowl will open in */
	levelColor?: string;
	/** Glyph colour of the settings and speed dots */
	color?: string;
}

/**
 * The settings corner (bottom left), mirroring the sound corner: the settings dot opens into
 * the level dot, nearest it, and the speed dot above, each opening its own view
 */
export const SettingsMenu: React.FC<SettingsMenuProps> = ({
	opening,
	levelColor,
	color = WHITE,
}) => {
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
					onPress: () => openSpeed(opening()),
					label: `Tilt speed, ${speed.label.toLowerCase()}`,
				},
				{
					key: "level",
					icon: "level",
					color: levelColor,
					onPress: () => openLevel(opening()),
					label: "Set level pose",
				},
			]}
		/>
	);
};
