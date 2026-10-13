import AVFoundation
import ExpoModulesCore

public class OtherAudioModule: Module {
  public func definition() -> ModuleDefinition {
    Name("OtherAudio")

    // True while another app's non-mixable audio plays; Apple's cue for an Ambient game to mute its soundtrack.
    Function("isOtherAudioPlaying") {
      AVAudioSession.sharedInstance().secondaryAudioShouldBeSilencedHint
    }
  }
}
