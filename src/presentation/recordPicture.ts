import type { SkCanvas, SkPicture, SkPictureRecorder } from "@shopify/react-native-skia";

/**
 * Record `draw` into a picture with a recorder kept from frame to frame, instead of Skia's
 * createPicture, which makes a new recorder every call. Skia reports every recorder to Hermes
 * as 1 MB of native memory however little it holds, so a new one each frame set off a garbage
 * collection on the UI thread nearly every frame. A recorder can record again once it has
 * finished; keep one per picture that is recorded every frame, used only on the UI thread.
 */
export function recordPicture(
	recorder: SkPictureRecorder,
	draw: (canvas: SkCanvas) => void,
): SkPicture {
	"worklet";
	draw(recorder.beginRecording());
	return recorder.finishRecordingAsPicture();
}
