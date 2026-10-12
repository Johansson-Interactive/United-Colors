import { DROP_SKSL, LIQUID_SKSL, SMIN_SKSL, WALL_SKSL } from "../../presentation/liquidShader";
import { MERGE_SKSL } from "../../presentation/mergeShader";
import { WALL_DROP_SKSL } from "../../presentation/wallDropShader";

describe("liquid shader", () => {
	it("draws the player and the play button with the same liquid", () => {
		expect(MERGE_SKSL).toContain(LIQUID_SKSL);
		expect(DROP_SKSL).toContain(LIQUID_SKSL);
	});

	it("joins and cuts bodies at the walls with one smooth-min everywhere", () => {
		expect(WALL_SKSL).toContain("smin(");
		for (const sksl of [MERGE_SKSL, WALL_DROP_SKSL]) {
			expect(sksl).toContain(SMIN_SKSL);
			expect(sksl).toContain(WALL_SKSL);
			expect(sksl.indexOf(SMIN_SKSL)).toBeLessThan(sksl.indexOf(WALL_SKSL));
		}
	});

	it("declares the drop's uniforms in the order the button passes them", () => {
		const names = [...DROP_SKSL.matchAll(/uniform \w+ (\w+);/g)].map((m) => m[1]);
		expect(names).toEqual(["center", "radius", "jelly", "color", "glare"]);
	});
});
