import { versionTag } from "../../presentation/versionTag";

describe("versionTag", () => {
	it("joins the version and build with a middle dot", () => {
		expect(versionTag({ version: "1.0.0", build: "42", dev: false })).toBe("1.0.0 · 42");
	});

	it("marks a development build", () => {
		expect(versionTag({ version: "1.0.0", build: "1", dev: true })).toBe("1.0.0 · 1 · DEV");
	});

	it("leaves out what the platform cannot tell", () => {
		expect(versionTag({ version: "1.0.0", build: null, dev: false })).toBe("1.0.0");
		expect(versionTag({ version: null, build: "42", dev: false })).toBe("42");
		expect(versionTag({ version: null, build: null, dev: false })).toBe("");
	});
});
