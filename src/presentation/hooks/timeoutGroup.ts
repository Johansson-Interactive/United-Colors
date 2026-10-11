/** A set of pending timeouts that can all be cancelled at once, e.g. when a screen unmounts. */
export interface TimeoutGroup {
	/** Run `fn` after `ms`, unless `clearAll` runs first */
	schedule(fn: () => void, ms: number): void;
	/** Cancel every timeout that has not fired yet */
	clearAll(): void;
	/** Number of timeouts still pending */
	readonly size: number;
}

export function createTimeoutGroup(): TimeoutGroup {
	const pending = new Set<ReturnType<typeof setTimeout>>();
	return {
		schedule(fn, ms) {
			const timer = setTimeout(() => {
				pending.delete(timer);
				fn();
			}, ms);
			pending.add(timer);
		},
		clearAll() {
			for (const timer of pending) clearTimeout(timer);
			pending.clear();
		},
		get size() {
			return pending.size;
		},
	};
}
