import { Fill, Picture, Rect, Shader, Skia } from "@shopify/react-native-skia";
import type React from "react";
import { type SharedValue, useDerivedValue } from "react-native-reanimated";
import type { SceneLayerValues } from "../hooks/useStageScene";
import { ROOM_SKSL, type RoomUniforms } from "../room";
import { compileEffect, MERGE_EFFECT, WALL_DROP_EFFECT } from "../sceneDrawer";
import { WALL_DROP_SLOTS, type WallDropSlot } from "../wallDropShader";

/** How far a fully frosted scene is blurred (sigma) and dimmed (the ink laid over it) */
export const FROST_MAX_SIGMA = 14;
export const FROST_MAX_DIM = 0.5;

/** The room (see room.ts), compiled once */
const ROOM_EFFECT = compileEffect("room", ROOM_SKSL);

interface RoomProps {
	/** The room shader's uniforms: the light follows the tilt, the wash the accent */
	uniforms: SharedValue<RoomUniforms>;
}

/**
 * The room (see room.ts): ink, the light pool and the edge wash, one shader filling the
 * canvas. Drawn as a Skia node driven by a shared value rather than recorded into a picture
 * every frame: a full-screen picture reports hundreds of KB to Hermes as external memory
 * each time it is recorded, which set off a garbage collection on the UI thread nearly every
 * frame. No dither on the paint: the shader dithers itself.
 */
export const Room: React.FC<RoomProps> = ({ uniforms }) => (
	<Fill>
		<Shader source={ROOM_EFFECT} uniforms={uniforms} />
	</Fill>
);

/** The wall drop slots, by index (see wallDrops) */
const DROP_SLOTS = Array.from({ length: WALL_DROP_SLOTS }, (_, i) => i);

interface WallDropProps {
	drops: SharedValue<WallDropSlot[]>;
	slot: number;
}

/** One wall drop slot (see wallDrops): the wall drop shader over the drop's rect, empty if unused */
const WallDrop: React.FC<WallDropProps> = ({ drops, slot }) => {
	const rect = useDerivedValue(() => {
		const drop = drops.get()[slot];
		return Skia.XYWHRect(drop.x, drop.y, drop.width, drop.height);
	});
	const uniforms = useDerivedValue(() => drops.get()[slot].uniforms);
	return (
		<Rect rect={rect}>
			<Shader source={WALL_DROP_EFFECT} uniforms={uniforms} />
		</Rect>
	);
};

/**
 * The scene in layers with the wall drops and the liquid body between them (see
 * sceneDrawer.ts): drawn on the play side, and again, frozen and frosted, as the pause world
 */
export const SceneLayers: React.FC<SceneLayerValues> = ({
	below,
	drops,
	dropGlares,
	body,
	above,
}) => {
	const bodyX = useDerivedValue(() => body.get().x);
	const bodyY = useDerivedValue(() => body.get().y);
	const bodyWidth = useDerivedValue(() => body.get().width);
	const bodyHeight = useDerivedValue(() => body.get().height);
	const bodyUniforms = useDerivedValue(() => body.get().uniforms);
	return (
		<>
			<Picture picture={below} />
			{DROP_SLOTS.map((slot) => (
				<WallDrop key={slot} drops={drops} slot={slot} />
			))}
			<Picture picture={dropGlares} />
			<Rect x={bodyX} y={bodyY} width={bodyWidth} height={bodyHeight}>
				<Shader source={MERGE_EFFECT} uniforms={bodyUniforms} />
			</Rect>
			<Picture picture={above} />
		</>
	);
};
