import { PointDotPlacement } from "../../domain/engine/PointDotPlacement";
import { seededRandom } from "../../domain/random";
import type { ScreenSize } from "../../domain/types";
import { PHONE_DENSITY, PHONES, PLAYER_SIZE, ROUNDED_PHONES } from "./phones";

/**
 * What placing one point dot costs, on portrait phones with the player all over the board.
 * Run on demand with `pnpm bench`; not part of verify, and nothing here is asserted.
 */

/** A small phone with square corners, and two larger ones with rounded corners */
const BENCHED: ScreenSize[] = [PHONES[1], ROUNDED_PHONES[0], ROUNDED_PHONES[2]];

/** The player on a 7 × 13 lattice over the screen, inside it */
function lattice(screen: ScreenSize): { x: number; y: number; size: number }[] {
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
	const runs = BENCHED.map((screen) => {
		const placement = new PointDotPlacement(seededRandom(1));
		const spots = lattice(screen);
		let next = 0;
		return bench(`${screen.width} × ${screen.height}`, () => {
			placement.place(screen, spots[next], PHONE_DENSITY);
			next = (next + 1) % spots.length;
		});
	});
	await bench.compare(...runs);
});
