import { catchPop } from "../../presentation/effects/catchPop";
import { COMBO_AMBER } from "../../presentation/theme/theme";

describe("catchPop", () => {
	it("shows what a catch paid, in the player's colour on its own or first in a combo", () => {
		expect(catchPop({ value: 5, step: 1, sameTick: false }, "#E91E63")).toEqual({
			text: "+5",
			color: "#E91E63",
		});
	});

	it("in amber from the second catch of a combo on", () => {
		expect(catchPop({ value: 3, step: 3, sameTick: false }, "#E91E63")).toEqual({
			text: "+3",
			color: COMBO_AMBER,
		});
		expect(COMBO_AMBER).toBe("#FFC107");
	});
});
