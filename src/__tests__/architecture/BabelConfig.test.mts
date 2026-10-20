import { SRC_ROOT, transformAsMetro } from "./appBabel.mts";

describe("release Babel configuration", () => {
	it("transforms TypeScript with the preset available through Expo's dependencies", () => {
		const code = transformAsMetro(
			"export const score: number = 42;",
			`${SRC_ROOT}bundle-check.ts`,
			{
				platform: "android",
				isDev: false,
			},
		);

		expect(code).toContain("42");
		expect(code).not.toContain(": number");
	});
});
