package expo.modules.displayrate

import android.util.Log
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class DisplayRateModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DisplayRate")

    // Ask for the display's fastest refresh rate at its current resolution, or hand the choice
    // back to the system. Android picks the rate from touches and from how often the app draws:
    // a tilt game sends no touches, so phones like the OnePlus 9 fall from 120 to 60 Hz during
    // play while the tapped menus stay at 120. Does nothing when there's no window yet. The
    // request lives on the activity's window, so an activity recreated mid-run drops it until
    // the next call (the next phase change, usually a pause).
    AsyncFunction("setFastest") { fast: Boolean ->
      val window = appContext.currentActivity?.window ?: return@AsyncFunction
      val display = window.decorView.display ?: return@AsyncFunction
      val current = display.mode
      // Keep the resolution the user chose; some phones list each rate at several
      val mode = if (fast) {
        display.supportedModes
          .filter { it.physicalWidth == current.physicalWidth && it.physicalHeight == current.physicalHeight }
          .maxByOrNull { it.refreshRate }
      } else {
        null
      }
      val attributes = window.attributes
      val modeId = mode?.modeId ?: 0
      // JS only calls on a change of phase, but its first call at launch hands back a choice
      // never taken; skip rewriting the window's attributes when nothing changes
      if (attributes.preferredDisplayModeId != modeId) {
        attributes.preferredDisplayModeId = modeId
        window.attributes = attributes
        Log.i(TAG, if (mode != null) "asked for ${mode.refreshRate} Hz" else "rate left to the system")
      }
    }.runOnQueue(Queues.MAIN)
  }

  companion object {
    private const val TAG = "DisplayRate"
  }
}
