package expo.modules.displaycorners

import android.os.Build
import android.view.RoundedCorner
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class DisplayCornersModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DisplayCorners")

    // The radius (dp) of the screen's rounded corners, the largest of the four; 0 on a square
    // screen, null where Android can't say (before Android 12, or with no activity yet).
    AsyncFunction("getCornerRadius") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return@AsyncFunction null
      val activity = appContext.currentActivity ?: return@AsyncFunction null
      val display = activity.display ?: return@AsyncFunction null
      val positions = listOf(
        RoundedCorner.POSITION_TOP_LEFT,
        RoundedCorner.POSITION_TOP_RIGHT,
        RoundedCorner.POSITION_BOTTOM_LEFT,
        RoundedCorner.POSITION_BOTTOM_RIGHT,
      )
      val radius = positions.maxOf { display.getRoundedCorner(it)?.radius ?: 0 }
      (radius / activity.resources.displayMetrics.density).toDouble()
    }
  }
}
