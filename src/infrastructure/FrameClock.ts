import { GAME_HERTZ } from "../domain/constants";

const MAX_UPDATES_PER_FRAME = 5;

/**
 * Fixed-step simulation clock on requestAnimationFrame (JS thread).
 * `onTick` runs at GAME_HERTZ (30 Hz) regardless of render FPS.
 * `onFrame` runs once per rendered frame after any ticks, with elapsed ms (clamped) and
 * `alpha` (0..1, fraction of a tick elapsed since the last tick) for latency-critical work
 * like player movement and between-tick rendering.
 */
export class FrameClock {
	private running = false;
	private rafId: number | null = null;
	private lastTime = 0;
	private accumulator = 0;
	private readonly stepMs = 1000 / GAME_HERTZ;

	constructor(
		private onTick: () => void,
		private onFrame?: (dtMs: number, alpha: number) => void,
	) {}

	start(): void {
		if (this.running) return;
		this.running = true;
		this.lastTime = performance.now();
		this.accumulator = 0;
		this.loop();
	}

	stop(): void {
		this.running = false;
		if (this.rafId != null) {
			cancelAnimationFrame(this.rafId);
			this.rafId = null;
		}
	}

	private loop = (): void => {
		if (!this.running) return;

		const now = performance.now();
		const dt = now - this.lastTime;
		this.lastTime = now;
		this.accumulator += dt;

		let updates = 0;

		while (this.accumulator >= this.stepMs && updates < MAX_UPDATES_PER_FRAME) {
			this.onTick();
			this.accumulator -= this.stepMs;
			updates++;
		}

		// Prevent spiral of death
		if (this.accumulator > this.stepMs) {
			this.accumulator = this.stepMs;
		}

		this.onFrame?.(
			Math.min(dt, this.stepMs * MAX_UPDATES_PER_FRAME),
			Math.min(this.accumulator / this.stepMs, 1),
		);

		// A callback may have stopped the clock; then this frame was the last
		if (this.running) this.rafId = requestAnimationFrame(this.loop);
	};
}
