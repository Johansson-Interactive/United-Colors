import type React from "react";
import { CORNER_INSET, WHITE } from "../theme/theme";
import { sensitivityChoice } from "../tilt/sensitivity";
import { DotMenu } from "./DotMenu";

interface SettingsMenuProps {
	/** Tilt sensitivity, a multiple of the default speed; the speed dot shows it */
	sensitivity: number;
	/** Open the settle bowl to set the level pose */
	onLevel: () => void;
	/** Open the speed view to choose how fast the dot moves */
	onSpeed: () => void;
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
	sensitivity,
	onLevel,
	onSpeed,
	levelColor,
	color = WHITE,
}) => {
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
					onPress: onSpeed,
					label: `Tilt speed, ${speed.label.toLowerCase()}`,
				},
				{
					key: "level",
					icon: "level",
					color: levelColor,
					onPress: onLevel,
					label: "Set level pose",
				},
			]}
		/>
	);
};
