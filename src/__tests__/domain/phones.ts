import { PLAYER_DOT_SIZE_RATIO, POINT_DOT_SIZE_RATIO } from "../../domain/constants";
import type { ScreenSize } from "../../domain/types";

/** The density a phone plays at: a player is 50 pt across */
export const PHONE_DENSITY = 400;
/** The player's size there */
export const PLAYER_SIZE = PLAYER_DOT_SIZE_RATIO * PHONE_DENSITY;
/** A point dot's size there, once grown in (it spawns at 0) */
export const POINT_SIZE = POINT_DOT_SIZE_RATIO * PHONE_DENSITY;

/** Portrait phone screens, in pt, with square corners */
export const PHONES: ScreenSize[] = [
	{ width: 390, height: 844 },
	{ width: 375, height: 667 },
	{ width: 430, height: 932 },
	{ width: 360, height: 800 },
];

/** The same phones with the rounded corners most of them have */
export const ROUNDED_PHONES: ScreenSize[] = PHONES.map((phone) => ({
	...phone,
	corners: { radius: 55, curve: "continuous" },
}));
