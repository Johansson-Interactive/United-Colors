import type { GameEngine } from "../../domain/engine/GameEngine";
import type { GameStore } from "../GameStore";

export function startGame(engine: GameEngine, store: GameStore, color?: string): void {
	engine.startGame(color);
	store.getState().updateFrame(engine.getFrame());
}
