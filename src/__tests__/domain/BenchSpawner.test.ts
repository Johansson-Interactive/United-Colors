import { GAME_HERTZ } from "../../domain/constants";
import { BenchSpawner } from "../../domain/engine/BenchSpawner";
import { GameEngine } from "../../domain/engine/GameEngine";
import { seededRandom } from "../../domain/random";

const SCREEN = { width: 400, height: 800 };
const MINUTE = GAME_HERTZ * 60;

function run(spawner: BenchSpawner, ticks: number, refusals = false) {
	const engine = new GameEngine({
		density: 100,
		screen: SCREEN,
		spawner,
		refusals,
		random: seededRandom(99),
	});
	engine.startGame();
	const counts: number[] = [];
	for (let t = 0; t < ticks; t++) {
		engine.tick();
		counts.push(engine.getFrame().dots.length);
	}
	return counts;
}

describe("seededRandom", () => {
	it("gives the same numbers for the same seed, in [0, 1)", () => {
		const a = seededRandom(7);
		const b = seededRandom(7);
		const first = Array.from({ length: 50 }, a);
		expect(Array.from({ length: 50 }, b)).toEqual(first);
		for (const n of first) {
			expect(n).toBeGreaterThanOrEqual(0);
			expect(n).toBeLessThan(1);
		}
	});

	it("gives other numbers for another seed", () => {
		expect(seededRandom(1)()).not.toBe(seededRandom(2)());
	});
});

describe("BenchSpawner", () => {
	it("fills the screen at a late run's rate from the start", () => {
		const late = run(new BenchSpawner(seededRandom(1), 20 * MINUTE, 200), 20 * GAME_HERTZ);
		const early = run(new BenchSpawner(seededRandom(1), 0, 200), 20 * GAME_HERTZ);
		expect(late[late.length - 1]).toBeGreaterThan(3 * early[early.length - 1]);
	});

	it("holds at its dot count", () => {
		const counts = run(new BenchSpawner(seededRandom(1), 20 * MINUTE, 40), 60 * GAME_HERTZ);
		expect(Math.max(...counts)).toBeLessThanOrEqual(41);
		expect(counts[counts.length - 1]).toBeGreaterThanOrEqual(30);
	});

	it("spawns the same run for the same seed", () => {
		const a = run(new BenchSpawner(seededRandom(3), 20 * MINUTE, 60), 30 * GAME_HERTZ);
		const b = run(new BenchSpawner(seededRandom(3), 20 * MINUTE, 60), 30 * GAME_HERTZ);
		expect(b).toEqual(a);
	});
});
