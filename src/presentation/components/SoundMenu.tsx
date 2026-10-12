import type React from "react";
import { CORNER_INSET, WHITE } from "../theme/theme";
import { DotMenu } from "./DotMenu";

interface SoundMenuProps {
	soundEnabled: boolean;
	musicEnabled: boolean;
	onToggleSound: () => void;
	onToggleMusic: () => void;
	/** Glyph colour while a switch is on */
	color?: string;
}

/**
 * The sound corner (bottom right): the sound dot opens into two smaller dots, one for the
 * music and one for the effects, each toggled with a tap
 */
export const SoundMenu: React.FC<SoundMenuProps> = ({
	soundEnabled,
	musicEnabled,
	onToggleSound,
	onToggleMusic,
	color = WHITE,
}) => {
	const anyOn = soundEnabled || musicEnabled;
	return (
		<DotMenu
			icon={anyOn ? "sound-on" : "sound-off"}
			on={anyOn}
			label="Sound settings"
			closeLabel="Close sound settings"
			color={color}
			corner={{ right: CORNER_INSET }}
			items={[
				{
					key: "music",
					icon: "music",
					on: musicEnabled,
					onPress: onToggleMusic,
					label: musicEnabled ? "Turn music off" : "Turn music on",
				},
				{
					key: "effects",
					icon: "effects",
					on: soundEnabled,
					onPress: onToggleSound,
					label: soundEnabled ? "Turn sound effects off" : "Turn sound effects on",
				},
			]}
		/>
	);
};
