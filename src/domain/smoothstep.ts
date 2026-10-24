/** 0 up to `from`, 1 from `to`, easing in and out between them */
export function smoothstep(from: number, to: number, value: number): number {
	const t = Math.min(1, Math.max(0, (value - from) / (to - from)));
	return t * t * (3 - 2 * t);
}
