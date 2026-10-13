const appState = vi.hoisted(() => ({
	listener: null as ((state: string) => void) | null,
	remove: vi.fn(),
}));

vi.mock("react-native", () => ({
	AppState: {
		addEventListener: (_type: string, listener: (state: string) => void) => {
			appState.listener = listener;
			return { remove: appState.remove };
		},
	},
}));

import { watchAppForeground } from "../../infrastructure/watchAppActive";

describe("watchAppForeground", () => {
	it("reports the background and the return, not iOS's inactive in between", () => {
		const seen: boolean[] = [];
		watchAppForeground((foreground) => seen.push(foreground));
		for (const state of ["inactive", "background", "inactive", "active"])
			appState.listener?.(state);
		expect(seen).toEqual([false, true]);
	});

	it("reports a return from Control Center, which never leaves the foreground", () => {
		const seen: boolean[] = [];
		watchAppForeground((foreground) => seen.push(foreground));
		for (const state of ["inactive", "active"]) appState.listener?.(state);
		expect(seen).toEqual([true]);
	});

	it("stops listening when unsubscribed", () => {
		watchAppForeground(() => {})();
		expect(appState.remove).toHaveBeenCalled();
	});
});
