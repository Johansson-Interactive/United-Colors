import { StateMachine } from "../../domain/engine/StateMachine";

describe("StateMachine", () => {
	let sm: StateMachine;

	beforeEach(() => {
		sm = new StateMachine("KIOSK");
	});

	it("starts in KIOSK phase", () => {
		expect(sm.phase).toBe("KIOSK");
	});

	it("transitions KIOSK -> RUNNING", () => {
		expect(sm.transition("RUNNING")).toBe(true);
		expect(sm.phase).toBe("RUNNING");
	});

	it("transitions RUNNING -> PAUSED", () => {
		sm.transition("RUNNING");
		expect(sm.transition("PAUSED")).toBe(true);
		expect(sm.phase).toBe("PAUSED");
	});

	it("transitions PAUSED -> RUNNING", () => {
		sm.transition("RUNNING");
		sm.transition("PAUSED");
		expect(sm.transition("RUNNING")).toBe(true);
		expect(sm.phase).toBe("RUNNING");
	});

	it("transitions RUNNING -> REJECTING -> GAME_OVER", () => {
		sm.transition("RUNNING");
		expect(sm.transition("REJECTING")).toBe(true);
		expect(sm.phase).toBe("REJECTING");
		expect(sm.transition("GAME_OVER")).toBe(true);
		expect(sm.phase).toBe("GAME_OVER");
	});

	it("only ends a game through the rejection, which cannot be paused", () => {
		sm.transition("RUNNING");
		expect(sm.transition("GAME_OVER")).toBe(false);
		sm.transition("REJECTING");
		expect(sm.transition("PAUSED")).toBe(false);
		expect(sm.transition("RUNNING")).toBe(false);
		expect(sm.phase).toBe("REJECTING");
	});

	it("transitions GAME_OVER -> KIOSK", () => {
		sm.transition("RUNNING");
		sm.transition("REJECTING");
		sm.transition("GAME_OVER");
		expect(sm.transition("KIOSK")).toBe(true);
		expect(sm.phase).toBe("KIOSK");
	});

	it("transitions GAME_OVER -> RUNNING (retry)", () => {
		sm.transition("RUNNING");
		sm.transition("REJECTING");
		sm.transition("GAME_OVER");
		expect(sm.transition("RUNNING")).toBe(true);
		expect(sm.phase).toBe("RUNNING");
	});

	it("full cycle: kiosk -> running -> paused -> running -> game_over -> kiosk", () => {
		expect(sm.phase).toBe("KIOSK");
		sm.transition("RUNNING");
		expect(sm.phase).toBe("RUNNING");
		sm.transition("PAUSED");
		expect(sm.phase).toBe("PAUSED");
		sm.transition("RUNNING");
		expect(sm.phase).toBe("RUNNING");
		sm.transition("REJECTING");
		sm.transition("GAME_OVER");
		expect(sm.phase).toBe("GAME_OVER");
		sm.transition("KIOSK");
		expect(sm.phase).toBe("KIOSK");
	});

	it("rejects invalid transitions", () => {
		expect(sm.transition("PAUSED")).toBe(false);
		expect(sm.phase).toBe("KIOSK");

		expect(sm.transition("GAME_OVER")).toBe(false);
		expect(sm.phase).toBe("KIOSK");
	});
});
