import { Circle, Line, Path, RoundedRect, Skia, vec } from "@shopify/react-native-skia";
import type React from "react";
import { useMemo } from "react";
import { WHITE } from "../theme/theme";
import { DotButton, type PressPoint } from "./DotButton";

interface IconDotProps {
	size: number;
	onPress: (point: PressPoint) => void;
	icon: "pause" | "sound-on" | "sound-off";
	accessibilityLabel: string;
	color?: string;
}

/** Secondary controls: a ghost dot carrying a small glyph drawn in Skia */
export const IconDot: React.FC<IconDotProps> = ({
	size,
	onPress,
	icon,
	accessibilityLabel,
	color = WHITE,
}) => {
	const radius = size / 2;
	// Canvas inside DotButton is padded by 55% of the radius on each side
	const c = radius + radius * 0.55;

	const waves = useMemo(() => {
		const path = Skia.Path.Make();
		const r1 = radius * 0.34;
		const r2 = radius * 0.55;
		path.addArc(Skia.XYWHRect(c - r1 - radius * 0.1, c - r1, r1 * 2, r1 * 2), -40, 80);
		path.addArc(Skia.XYWHRect(c - r2 - radius * 0.1, c - r2, r2 * 2, r2 * 2), -40, 80);
		return path;
	}, [c, radius]);

	return (
		<DotButton
			size={size}
			color={color}
			variant="ghost"
			onPress={onPress}
			accessibilityLabel={accessibilityLabel}
		>
			{icon === "pause" ? (
				<>
					<RoundedRect
						x={c - radius * 0.3}
						y={c - radius * 0.32}
						width={radius * 0.2}
						height={radius * 0.64}
						r={radius * 0.1}
						color={color}
					/>
					<RoundedRect
						x={c + radius * 0.1}
						y={c - radius * 0.32}
						width={radius * 0.2}
						height={radius * 0.64}
						r={radius * 0.1}
						color={color}
					/>
				</>
			) : (
				<>
					<Circle cx={c - radius * 0.22} cy={c} r={radius * 0.16} color={color} />
					{icon === "sound-on" ? (
						<Path path={waves} color={color} style="stroke" strokeWidth={2} strokeCap="round" />
					) : (
						<Line
							p1={vec(c + radius * 0.05, c - radius * 0.3)}
							p2={vec(c + radius * 0.5, c + radius * 0.3)}
							color={color}
							strokeWidth={2}
							strokeCap="round"
						/>
					)}
				</>
			)}
		</DotButton>
	);
};
