/** Touch feedback for game moments. Implemented by infrastructure. */
export interface GameHaptics {
	/** The player spits out a wrong-colour dot it refused */
	spit(): void;
}
