package expo.modules.systembars

import android.app.Activity
import android.content.Context
import android.os.Bundle
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import expo.modules.core.interfaces.Package
import expo.modules.core.interfaces.ReactActivityLifecycleListener

// Keeps the game immersive on every screen: the navigation bar, gesture handle and Samsung's
// taskbar are hidden, and a swipe from the edge shows them briefly over the game without moving
// it. Samsung's game mode would do this only for apps it recognises as games, which it decides
// outside our APK. No JS API: being immersive is a property of the window, not a game decision.
class SystemBarsPackage : Package {
  override fun createReactActivityLifecycleListeners(activityContext: Context): List<ReactActivityLifecycleListener> =
    listOf(ImmersiveListener)

  private object ImmersiveListener : ReactActivityLifecycleListener {
    // Before the first frame, so the playfield doesn't resize while the app starts
    override fun onCreate(activity: Activity, savedInstanceState: Bundle?) = hideSystemBars(activity)

    // Back from another app, the home or lock screen, or a system dialog. Folding or unfolding
    // doesn't recreate the activity, and the hidden bars persist on its window.
    override fun onResume(activity: Activity) = hideSystemBars(activity)
  }
}

private fun hideSystemBars(activity: Activity) {
  val window = activity.window
  WindowCompat.getInsetsController(window, window.decorView).run {
    systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    hide(WindowInsetsCompat.Type.systemBars())
  }
}
