import { CATCH_STAGGER_MS, catchPitch, createCatchStagger } from "../../application/catchCue";

describe("catchPitch", () => {
	it("rises a semitone per combo step after the first, holding at an octave", () => {
		expect([1, 2, 3, 12, 13, 14, 40].map(catchPitch)).toEqual([0, 1, 2, 11, 12, 12, 12]);
	});
});

describe("createCatchStagger", () => {
	/**
	 * A stagger on a clock the test sets, recording what it cues now and what it holds back;
	 * `fire` runs every held cue as its timer would
	 */
	function setup() {
		const clock = { now: 1000 };
		const log: string[] = [];
		const held: (() => void)[] = [];
		const stagger = createCatchStagger(
			(cue, ms) => {
				log.push(`hold ${ms}`);
				held.push(cue);
			},
			() => clock.now,
		);
		const cue = (sameTick: boolean, name = "now") => stagger(sameTick, () => log.push(name));
		const fire = () => {
			for (const run of held.splice(0)) run();
		};
		return { clock, log, cue, fire, stagger };
	}

	it("cues a catch right away unless it landed on the same tick as the one before", () => {
		const { clock, log, cue } = setup();
		cue(false);
		clock.now = 1033;
		cue(false);
		expect(log).toEqual(["now", "now"]);
	});

	it("cues a same-tick catch CATCH_STAGGER_MS after the one before, however it arrives", () => {
		const { log, cue } = setup();
		cue(false);
		cue(true);
		cue(true);
		expect(log).toEqual(["now", `hold ${CATCH_STAGGER_MS}`, `hold ${CATCH_STAGGER_MS * 2}`]);
		// Reported a frame later, it still waits out the rest of the gap
		const later = setup();
		later.cue(false);
		later.clock.now = 1016;
		later.cue(true);
		expect(later.log).toEqual(["now", `hold ${CATCH_STAGGER_MS - 16}`]);
	});

	it("never cues a catch before one still waiting", () => {
		const { clock, log, cue } = setup();
		cue(false);
		cue(true);
		clock.now = 1033;
		cue(false);
		clock.now = 2000;
		cue(false);
		expect(log).toEqual([
			"now",
			`hold ${CATCH_STAGGER_MS}`,
			`hold ${CATCH_STAGGER_MS - 33}`,
			"now",
		]);
	});

	it("cues a held catch when its timer fires", () => {
		const { log, cue, fire } = setup();
		cue(false);
		cue(true, "later");
		fire();
		expect(log).toEqual(["now", `hold ${CATCH_STAGGER_MS}`, "later"]);
	});

	it("drops every waiting cue on dispose", () => {
		const { log, cue, fire, stagger } = setup();
		cue(false);
		cue(true, "dropped");
		cue(true, "dropped");
		stagger.dispose();
		fire();
		expect(log).toEqual(["now", `hold ${CATCH_STAGGER_MS}`, `hold ${CATCH_STAGGER_MS * 2}`]);
	});
});
