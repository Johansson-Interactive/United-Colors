import type React from "react";
import type { MenuOpening } from "../flow/screenFlow";
import { CORNER_INSET, WHITE } from "../theme/theme";
import { sensitivityChoice } from "../tilt/sensitivity";
import { useCornerMenus } from "./CornerMenusProvider";
import { DotMenu } from "./DotMenu";

interface SettingsMenuProps {
	/**
	 * Called at the tap: returns where the tap came from and, on the title, the colour the play
	 * dot shows then, which the speed view opens in
	 */
	openingAt: () => MenuOpening;
	/** Glyph colour of the settings and speed dots */
	color?: string;
}

/**
 * The settings corner (bottom left), mirroring the sound corner: the settings dot opens into
 * the speed dot, which opens the speed view. There is no level pose to set: it is taken as each
 * run starts and as Get ready ends (ADR 0016).
 */
export const SettingsMenu: React.FC<SettingsMenuProps> = ({ openingAt, color = WHITE }) => {
	const { sensitivity, openSpeed } = useCornerMenus();
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
			]}
		/>
	);
};
