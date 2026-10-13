import { requireOptionalNativeModule } from "expo";

interface OtherAudioModule {
	isOtherAudioPlaying(): boolean;
}

/** The local module in modules/other-audio; missing from a dev client built before it */
const OtherAudio = requireOptionalNativeModule<OtherAudioModule>("OtherAudio");

/**
 * Whether another app is playing audio: iOS's hint that a game should silence its
 * soundtrack, Android's music-stream activity (which includes this app's own playback).
 * Without the native module, or if it fails, nothing is playing and the music behaves as
 * it did before it existed.
 */
export function isOtherAudioPlaying(): boolean {
	try {
		return OtherAudio?.isOtherAudioPlaying() ?? false;
	} catch {
		return false;
	}
}
