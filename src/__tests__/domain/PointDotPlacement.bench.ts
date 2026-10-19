import { PLAYER_DOT_SIZE_RATIO } from "../../domain/constants";
import { PointDotPlacement } from "../../domain/engine/PointDotPlacement";
import { seededRandom } from "../../domain/random";
import type { ScreenSize } from "../../domain/types";

/**
 * What placing one point dot costs, on portrait phones with the player all over the board.
 * Run on demand with `pnpm bench`; not part of verify, and nothing here is asserted.
 */

const DENSITY = 400;
const PLAYER_SIZE = PLAYER_DOT_SIZE_RATIO * DENSITY;
const PHONES: ScreenSize[] = [
	{ width: 375, height: 667, corners: { radius: 0, curve: "continuous" } },
	{ width: 390, height: 844, corners: { radius: 55, curve: "continuous" } },
	{ width: 430, height: 932, corners: { radius: 55, curve: "continuous" } },
];

/** The player on a 7 × 13 lattice over the screen, inside it */
function playerSpots(screen: ScreenSize): { x: number; y: number; size: number }[] {
	const r = PLAYER_SIZE / 2;
	const spots = [];
	for (let i = 0; i < 7; i++) {
		for (let j = 0; j < 13; j++) {
			const x = r + ((screen.width - 2 * r) * i) / 6;
			const y = r + ((screen.height - 2 * r) * j) / 12;
			spots.push({ x, y, size: PLAYER_SIZE });
		}
	}
	return spots;
}

test("point dot placement", async ({ bench }) => {
	const runs = PHONES.map((screen) => {
		const placement = new PointDotPlacement(seededRandom(1));
		const spots = playerSpots(screen);
		let next = 0;
		return bench(`${screen.width} × ${screen.height}`, () => {
			placement.place(screen, spots[next], DENSITY);
			next = (next + 1) % spots.length;
		});
	});
	await bench.compare(...runs);
});
