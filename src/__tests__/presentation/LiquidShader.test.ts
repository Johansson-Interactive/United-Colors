import { DROP_SKSL, LIQUID_SKSL } from "../../presentation/liquidShader";
import { MERGE_SKSL } from "../../presentation/mergeShader";

describe("liquid shader", () => {
	it("draws the player and the play button with the same liquid", () => {
		expect(MERGE_SKSL).toContain(LIQUID_SKSL);
		expect(DROP_SKSL).toContain(LIQUID_SKSL);
	});

	it("declares the drop's uniforms in the order the button passes them", () => {
		const names = [...DROP_SKSL.matchAll(/uniform \w+ (\w+);/g)].map((m) => m[1]);
		expect(names).toEqual(["center", "radius", "jelly", "color", "glare"]);
	});
});
