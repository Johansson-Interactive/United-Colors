import { playColourAt } from "../../presentation/overlays/playColour";
import { TRIO } from "../../presentation/theme/theme";

const BLEND_MARK = "blend";

describe("play dot colour", () => {
	const blend = vi.fn(() => BLEND_MARK);

	beforeEach(() => blend.mockClear());

	it("holds the exact TRIO colour across each hold without blending", () => {
		const holds: [number, number, string][] = [
			[0, 0.88, TRIO[0]],
			[1, 1.88, TRIO[1]],
			[2, 2.88, TRIO[2]],
		];
		for (const [from, to, colour] of holds) {
			for (let p = from; p <= to; p += 0.01) {
				expect(playColourAt(p, blend)).toBe(colour);
			}
		}
		expect(blend).not.toHaveBeenCalled();
	});

	it("blends only inside the gaps between holds", () => {
		for (const p of [0.9, 0.95, 1.9, 1.95, 2.9, 2.95]) {
			expect(playColourAt(p, blend)).toBe(BLEND_MARK);
		}
		expect(blend).toHaveBeenCalledTimes(6);
	});

	it("passes the blend the full input and output ranges", () => {
		playColourAt(0.94, blend);
		const [value, input, output] = blend.mock.calls[0] as unknown as [
			number,
			readonly number[],
			readonly string[],
		];
		expect(value).toBe(0.94);
		expect(input).toEqual([0, 0.88, 1, 1.88, 2, 2.88, 3]);
		expect(output).toEqual([TRIO[0], TRIO[0], TRIO[1], TRIO[1], TRIO[2], TRIO[2], TRIO[0]]);
	});
});
