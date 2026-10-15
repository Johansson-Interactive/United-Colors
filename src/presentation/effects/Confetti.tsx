import { Canvas, createPicture, Picture, type SkColor, Skia } from "@shopify/react-native-skia";
import type React from "react";
import { useEffect, useMemo } from "react";
import { StyleSheet } from "react-native";
import {
	cancelAnimation,
	Easing,
	useDerivedValue,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";
import { useStageBox } from "../layout/StageFrame";
import { TRIO } from "../theme/theme";

const COUNT = 70;
const DURATION_MS = 5200;

interface Particle {
	x: number;
	y0: number;
	speed: number;
	sway: number;
	phase: number;
	radius: number;
	color: string;
	/** `color` parsed once, so the picture worklet never calls Skia.Color per frame */
	parsedColor: SkColor;
}

/** Deterministic pseudo-random so the shower is stable across re-renders */
function mulberry32(seed: number) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** A shower of game-coloured dots for a new best score, computed purely from a clock */
export const Confetti: React.FC = () => {
	const { width, height } = useStageBox();
	const particles = useMemo<Particle[]>(() => {
		const rnd = mulberry32(7);
		return Array.from({ length: COUNT }, () => {
			const color = TRIO[Math.floor(rnd() * TRIO.length)];
			return {
				x: rnd() * width,
				y0: -rnd() * height * 0.8 - 20,
				speed: 0.12 + rnd() * 0.16,
				sway: 10 + rnd() * 22,
				phase: rnd() * Math.PI * 2,
				radius: 3 + rnd() * 5,
				color,
				parsedColor: Skia.Color(color),
			};
		});
	}, [width, height]);

	const clock = useSharedValue(0);
	useEffect(() => {
		clock.set(withTiming(DURATION_MS, { duration: DURATION_MS, easing: Easing.linear }));
		return () => cancelAnimation(clock);
	}, [clock]);

	const picture = useDerivedValue(() =>
		createPicture((canvas) => {
			const t = clock.get();
			const fade = t > DURATION_MS - 900 ? (DURATION_MS - t) / 900 : 1;
			const paint = Skia.Paint();
			paint.setAntiAlias(true);
			for (const p of particles) {
				const y = p.y0 + t * p.speed;
				if (y < -10 || y > height + 10) continue;
				const x = p.x + Math.sin(t * 0.004 + p.phase) * p.sway;
				paint.setColor(p.parsedColor);
				paint.setAlphaf(0.9 * fade);
				canvas.drawCircle(x, y, p.radius, paint);
			}
		}),
	);

	return (
		<Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
			<Picture picture={picture} />
		</Canvas>
	);
};
