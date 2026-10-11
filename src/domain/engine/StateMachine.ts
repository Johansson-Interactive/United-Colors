import type { GamePhase } from "../types";

const VALID_TRANSITIONS: ReadonlySet<string> = new Set<string>([
	"KIOSK->RUNNING",
	"RUNNING->PAUSED",
	"RUNNING->REJECTING",
	"REJECTING->GAME_OVER",
	"PAUSED->RUNNING",
	"PAUSED->KIOSK",
	"GAME_OVER->KIOSK",
	"GAME_OVER->RUNNING",
]);

export class StateMachine {
	private _phase: GamePhase;

	constructor(initial: GamePhase = "KIOSK") {
		this._phase = initial;
	}

	get phase(): GamePhase {
		return this._phase;
	}

	transition(to: GamePhase): boolean {
		const key = `${this._phase}->${to}`;
		if (!VALID_TRANSITIONS.has(key)) {
			return false;
		}
		this._phase = to;
		return true;
	}

	reset(): void {
		this._phase = "KIOSK";
	}
}
