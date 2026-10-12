import type React from "react";
import { useState } from "react";
import { Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import Animated, { ZoomIn, ZoomOut } from "react-native-reanimated";
import { CORNER_DOT_SIZE, DIM } from "../theme/theme";
import { type Icon, IconDot } from "./IconDot";

interface DotMenuItem {
	key: string;
	icon: Icon;
	/** Shown in the menu's colour when on, dimmed and struck through when off */
	on: boolean;
	onPress: () => void;
	label: string;
}

interface DotMenuProps {
	/** Glyph on the corner dot */
	icon: Icon;
	/** Whether the corner dot shows in colour or dimmed */
	on: boolean;
	/** Accessibility label of the corner dot while closed */
	label: string;
	/** Top to bottom, rising out of the corner dot */
	items: readonly DotMenuItem[];
	/** Glyph colour while on */
	color: string;
	/** Where the corner dot sits inside the overlay */
	corner: ViewStyle;
	/** Accessibility label of the backdrop that closes the menu */
	closeLabel: string;
}

const MAIN_SIZE = CORNER_DOT_SIZE;
const ITEM_SIZE = 36;

/**
 * A corner setting: tapping the corner dot lets smaller dots rise out of it, one per item,
 * each acted on with a tap. Tapping anywhere else, or the corner dot again, folds them back
 * in. Fills its parent so the outside tap can close it.
 */
export const DotMenu: React.FC<DotMenuProps> = ({
	icon,
	on,
	label,
	items,
	color,
	corner,
	closeLabel,
}) => {
	const [open, setOpen] = useState(false);

	return (
		<View style={StyleSheet.absoluteFill} pointerEvents="box-none">
			{open ? (
				<Pressable
					style={StyleSheet.absoluteFill}
					onPress={() => setOpen(false)}
					accessibilityLabel={closeLabel}
				/>
			) : null}
			<View style={[styles.corner, corner]} pointerEvents="box-none">
				{open
					? items.map((item, i) => (
							<Animated.View
								key={item.key}
								entering={ZoomIn.delay((items.length - 1 - i) * 25)
									.springify()
									.stiffness(900)
									.damping(28)
									.mass(0.5)}
								exiting={ZoomOut.duration(70)}
							>
								<IconDot
									size={ITEM_SIZE}
									icon={item.icon}
									onPress={item.onPress}
									accessibilityLabel={item.label}
									color={item.on ? color : DIM}
									struck={!item.on}
								/>
							</Animated.View>
						))
					: null}
				<IconDot
					size={MAIN_SIZE}
					icon={icon}
					onPress={() => setOpen((value) => !value)}
					accessibilityLabel={open ? closeLabel : label}
					color={on ? color : DIM}
				/>
			</View>
		</View>
	);
};

const styles = StyleSheet.create({
	corner: {
		position: "absolute",
		bottom: 26,
		alignItems: "center",
		gap: 18,
	},
});
