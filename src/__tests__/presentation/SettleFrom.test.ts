import { quietsKiosk } from "../../presentation/overlays/settleFrom";

describe("settle origin", () => {
	it("stops and hides the kiosk when levelling from the title", () => {
		expect(quietsKiosk("start")).toBe(true);
		expect(quietsKiosk("menu")).toBe(true);
	});

	it("leaves the frozen game alone when levelling from pause", () => {
		expect(quietsKiosk("pause")).toBe(false);
	});
});
