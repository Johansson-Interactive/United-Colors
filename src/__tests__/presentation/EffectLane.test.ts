import { createEffectLane, type EffectReducer } from "../../presentation/effects/effectLane";

/** A test item: an id from the lane, and how long it lives once it has drawn a frame */
interface Item {
	id: number;
	life: number;
	start: number;
}

/** A plain list reducer: stamps an item on its first frame and drops it once its life is up */
const LIST: EffectReducer<Item[], Item> = {
	add: (list, item) => [...list, { ...item }],
	advance: (list, now) => {
		for (const item of list) if (item.start < 0) item.start = now;
		const next = list.filter((item) => now - item.start < item.life);
		return next.length === list.length ? list : next;
	},
	idle: (list) => list.length === 0,
};

/**
 * A lane on fakes. The UI thread is a queue: what the JS thread asks of it (an add's update)
 * runs at the next frame, before the step, as Reanimated runs it. The clock records each switch
 * and runs a frame only while on. The JS thread is a queue too, which `flush` runs.
 */
function setup<S, T>(reducer: EffectReducer<S, T>, initial: S) {
	const log: string[] = [];
	const ui: (() => void)[] = [];
	const js: (() => void)[] = [];
	const cell = <V>(value: V) => ({
		get: () => value,
		set: (next: V) => {
			value = next;
		},
		modify: (update: (current: V) => V) => {
			ui.push(() => {
				value = update(value);
			});
		},
	});
	const items = cell(initial);
	const time = cell(0);
	let on = false;
	const lane = createEffectLane(reducer, {
		items,
		seen: cell(-1),
		time,
		clock: {
			setActive: (active) => {
				on = active;
				log.push(active ? "on" : "off");
			},
		},
		toJS: (call, arg) => {
			js.push(() => call(arg));
		},
	});
	return {
		lane,
		log,
		/** Whether the clock is running */
		running: () => on,
		/** What the drawing sees: the items and the frame time */
		drawn: () => items.get(),
		time: () => time.get(),
		/** The UI thread's next frame at `now`, if the clock runs */
		frame: (now: number) => {
			for (const run of ui.splice(0)) run();
			if (on) lane.step({ timestamp: now });
		},
		/** Run what the UI thread asked of the JS thread */
		flush: () => {
			for (const run of js.splice(0)) run();
		},
	};
}

const item = (life: number) => (id: number) => ({ id, life, start: -1 });

describe("effect lane", () => {
	it("switches the clock on when an item is added", () => {
		const { lane, running } = setup(LIST, []);
		expect(running()).toBe(false);
		lane.add(item(100));
		expect(running()).toBe(true);
	});

	it("advances the items each frame through the reducer, publishing the frame time", () => {
		const { lane, drawn, time, frame } = setup(LIST, []);
		lane.add(item(100));
		lane.add(item(200));
		frame(1000);
		expect(drawn()).toEqual([
			{ id: 0, life: 100, start: 1000 },
			{ id: 1, life: 200, start: 1000 },
		]);
		expect(time()).toBe(1000);
		frame(1100);
		expect(drawn()).toEqual([{ id: 1, life: 200, start: 1000 }]);
		expect(time()).toBe(1100);
		frame(1200);
		expect(drawn()).toEqual([]);
	});

	it("switches the clock off once an idle frame's stop reaches the JS thread", () => {
		const { lane, running, frame, flush } = setup(LIST, []);
		lane.add(item(100));
		frame(1000);
		flush();
		expect(running()).toBe(true);
		frame(1100);
		expect(running()).toBe(true);
		flush();
		expect(running()).toBe(false);
	});

	it("ignores a stop sent before a newer item reached the UI thread", () => {
		const { lane, running, drawn, frame, flush } = setup(LIST, []);
		lane.add(item(100));
		frame(1000);
		frame(1100);
		// The stop for the first is on its way when the second is added
		lane.add(item(100));
		flush();
		expect(running()).toBe(true);
		// The second still gets its frames, and the clock stops once it is done
		frame(1116);
		expect(drawn()).toEqual([{ id: 1, life: 100, start: 1116 }]);
		frame(1216);
		flush();
		expect(running()).toBe(false);
	});

	it("ignores a stop from an idle frame before a newer item's update ran on the UI thread", () => {
		const { lane, running, drawn, frame, flush } = setup(LIST, []);
		lane.add(item(100));
		frame(1000);
		lane.add(item(100));
		// The JS thread has handed out the second, but the UI thread runs a frame without it
		lane.step({ timestamp: 1100 });
		flush();
		expect(running()).toBe(true);
		frame(1116);
		expect(drawn()).toEqual([{ id: 1, life: 100, start: 1116 }]);
	});

	it("takes several adds within one frame, and stops only once the last is done", () => {
		const { lane, log, running, drawn, frame, flush } = setup(LIST, []);
		lane.add(item(100));
		lane.add(item(150));
		lane.add(item(200));
		frame(1000);
		expect(drawn().map((i) => i.id)).toEqual([0, 1, 2]);
		frame(1100);
		frame(1150);
		flush();
		expect(running()).toBe(true);
		frame(1200);
		flush();
		expect(running()).toBe(false);
		expect(log).toEqual(["on", "on", "on", "off"]);
	});

	it("hands out ids from 0, one apart, so the stop for the newest is the one taken", () => {
		// The frozen pops: a compiled-in pre-increment gave each item the id one past the newest
		// the stop was checked against, so the newest's stop was refused and an older one taken
		const { lane, running, frame, flush } = setup(LIST, []);
		const ids: number[] = [];
		const make = (id: number) => {
			ids.push(id);
			return item(100)(id);
		};
		lane.add(make);
		frame(1000);
		frame(1100);
		flush();
		expect(running()).toBe(false);
		lane.add(make);
		lane.add(make);
		frame(1200);
		frame(1300);
		flush();
		expect(running()).toBe(false);
		expect(ids).toEqual([0, 1, 2]);
	});

	it("runs over a state that is not a list, idle when its reducer says so", () => {
		interface Count {
			total: number;
			pending: { id: number; value: number }[];
			settledAt: number;
		}
		const COUNT: EffectReducer<Count, { id: number; value: number }> = {
			add: (state, c) => ({ ...state, pending: [...state.pending, c] }),
			advance: (state, now) =>
				state.pending.length === 0
					? state
					: {
							total: state.total + state.pending.reduce((sum, c) => sum + c.value, 0),
							pending: [],
							settledAt: now,
						},
			// Still for 50 ms after the last count, as a bump would play out
			idle: (state, now) => state.pending.length === 0 && now - state.settledAt >= 50,
		};
		const { lane, running, drawn, frame, flush } = setup(COUNT, {
			total: 7,
			pending: [],
			settledAt: Number.NEGATIVE_INFINITY,
		});
		lane.add((id) => ({ id, value: 3 }));
		frame(1000);
		expect(drawn().total).toBe(10);
		frame(1016);
		flush();
		expect(running()).toBe(true);
		frame(1050);
		flush();
		expect(running()).toBe(false);
	});

	it("leaves nothing on its way to the JS thread that touches the clock after teardown", () => {
		const { lane, log, running, frame, flush } = setup(LIST, []);
		lane.add(item(100));
		frame(1000);
		frame(1100);
		lane.dispose();
		expect(running()).toBe(false);
		const before = log.length;
		flush();
		frame(1200);
		flush();
		expect(log.length).toBe(before);
	});

	it("runs again when added to after teardown, as after a Fast Refresh re-runs its effects", () => {
		const { lane, running, drawn, frame, flush } = setup(LIST, []);
		lane.add(item(100));
		frame(1000);
		lane.dispose();
		lane.add(item(100));
		expect(running()).toBe(true);
		frame(1100);
		expect(drawn().map((i) => i.id)).toEqual([1]);
		frame(1200);
		flush();
		expect(running()).toBe(false);
	});
});
