package expo.modules.otheraudio

import android.content.Context
import android.media.AudioManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class OtherAudioModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("OtherAudio")

    // True while any app plays music. That includes this app, so read it while our own music is silent.
    Function("isOtherAudioPlaying") {
      val audio = appContext.reactContext?.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
      audio?.isMusicActive ?: false
    }
  }
}
