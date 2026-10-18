import { Canvas, Path, Skia } from "@shopify/react-native-skia";
import type React from "react";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { cornerCubics, cornerExtent } from "../../domain/arena";
import type { ScreenSize } from "../../domain/types";
import { BEZEL } from "../theme/theme";

const CORNERS = [
	{ key: "topLeft", flipX: false, flipY: false, style: { top: 0, left: 0 } },
	{ key: "topRight", flipX: true, flipY: false, style: { top: 0, right: 0 } },
	{ key: "bottomLeft", flipX: false, flipY: true, style: { bottom: 0, left: 0 } },
	{ key: "bottomRight", flipX: true, flipY: true, style: { bottom: 0, right: 0 } },
] as const;

/** Black outside the corner curve, from the corner itself round the curve, `extent` across */
function makeCap(screen: ScreenSize, extent: number, flipX: boolean, flipY: boolean) {
	const x = (u: number) => (flipX ? extent - u : u);
	const y = (v: number) => (flipY ? extent - v : v);
	const builder = Skia.PathBuilder.Make().moveTo(x(0), y(0));
	cornerCubics(screen).forEach(([u0, v0, u1, v1, u2, v2, u3, v3], i) => {
		if (i === 0) builder.lineTo(x(u0), y(v0));
		builder.cubicTo(x(u1), y(v1), x(u2), y(v2), x(u3), y(v3));
	});
	return builder.close().detach();
}

/**
 * The stage frame's corners rounded off the way the phone's glass is (see arena.ts, which
 * the dots bounce off), drawn over everything in the frame in the black of the insets, so
 * the room and the flood round off too. At the bottom they sit on the glass's own corners;
 * at the top, below the notch, they echo them.
 */
export const FrameCorners: React.FC<{ screen: ScreenSize }> = ({ screen }) => {
	const extent = cornerExtent(screen);
	const caps = useMemo(
		() =>
			extent > 0
				? CORNERS.map((c) => ({ ...c, path: makeCap(screen, extent, c.flipX, c.flipY) }))
				: [],
		[screen, extent],
	);
	return caps.map((cap) => (
		<View
			key={cap.key}
			style={[styles.corner, { width: extent, height: extent }, cap.style]}
			pointerEvents="none"
		>
			<Canvas style={StyleSheet.absoluteFill}>
				<Path path={cap.path} color={BEZEL} />
			</Canvas>
		</View>
	));
};

const styles = StyleSheet.create({
	corner: { position: "absolute" },
});
