import { bindAppLeave } from "../../application/useCases/BindAppLeave";

function fakeAppState() {
	let listener: ((active: boolean) => void) | null = null;
	return {
		watch: (next: (active: boolean) => void) => {
			listener = next;
			return () => {
				listener = null;
			};
		},
		set: (active: boolean) => listener?.(active),
	};
}

function setup() {
	const app = fakeAppState();
	let leaves = 0;
	const unbind = bindAppLeave(app.watch, () => leaves++);
	return { app, unbind, leaves: () => leaves };
}

describe("bindAppLeave", () => {
	it("reports each time the app leaves the foreground", () => {
		const { app, leaves } = setup();
		app.set(false);
		app.set(true);
		app.set(false);
		expect(leaves()).toBe(2);
	});

	it("does not report the app coming back", () => {
		const { app, leaves } = setup();
		app.set(true);
		expect(leaves()).toBe(0);
	});

	it("stops watching after unsubscribe", () => {
		const { app, unbind, leaves } = setup();
		unbind();
		app.set(false);
		expect(leaves()).toBe(0);
	});
});
