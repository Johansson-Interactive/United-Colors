import type { BuildInfo } from "../application/ports";

/**
 * The title's small print: the version and build number, as "1.0.0 · 42", so a screenshot
 * says which build it came from. A development build adds "DEV", since it runs as its own app
 * beside the real one. Whatever the platform cannot tell is left out; with nothing known the
 * tag is empty and the footer shows none.
 */
export function versionTag({ version, build, dev }: BuildInfo): string {
	return [version, build, dev ? "DEV" : null].filter((part) => part).join(" · ");
}
