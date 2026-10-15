package expo.modules.performancehint

import android.os.Build
import android.os.Debug
import android.os.Handler
import android.os.Looper
import android.os.PerformanceHintManager
import android.os.Process
import android.view.Choreographer
import androidx.annotation.RequiresApi
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/**
 * Asks Android to run the game's frame work on cores fast enough for it.
 *
 * A tilt game gets no touch input, so the input boost that lifts an ordinary app's threads onto
 * the big cores never fires, and the scheduler leaves the main thread (Reanimated worklets and
 * every Skia render) on the little ones. A performance hint session (Android 12+) is the
 * supported way out: every frame the module reports how long the main thread worked against a
 * target of `workShare` of the frame interval, and the system sizes the CPU for the session's
 * threads (the main thread, the JS thread and Hermes's garbage collectors) to meet it.
 */
class PerformanceHintModule : Module() {
  private val main = Handler(Looper.getMainLooper())
  /** Fraction of the frame interval the main thread's work should fit in; 0 is off */
  private var workShare = 0.0
  private var session: Any? = null
  private var frames: FrameReporter? = null

  override fun definition() = ModuleDefinition {
    Name("PerformanceHint")

    // Start hinting (or change the share); false where Android has no hint sessions
    AsyncFunction("start") { share: Double ->
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return@AsyncFunction false
      workShare = share.coerceIn(0.1, 1.0)
      resume()
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("stop") {
      workShare = 0.0
      pause()
    }.runOnQueue(Queues.MAIN)

    OnActivityEntersForeground { main.post { if (workShare > 0) resume() } }
    OnActivityEntersBackground { main.post { pause() } }
    OnDestroy { main.post { pause() } }
  }

  /** On the main thread: open the session if needed and report every frame */
  private fun resume(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return false
    val reporter = frames ?: FrameReporter(openSession() ?: return false).also { frames = it }
    reporter.share = workShare
    reporter.start()
    return true
  }

  private fun pause() {
    frames?.stop()
    frames = null
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      (session as? PerformanceHintManager.Session)?.close()
    }
    session = null
  }

  @RequiresApi(Build.VERSION_CODES.S)
  private fun openSession(): PerformanceHintManager.Session? {
    val manager = appContext.reactContext?.getSystemService(PerformanceHintManager::class.java)
      ?: return null
    val threads = (listOf(Process.myTid()) + threadsNamed(SESSION_THREAD_NAMES)).distinct()
    val opened = manager.createHintSession(threads.toIntArray(), frameIntervalNanos()) ?: return null
    session = opened
    return opened
  }

  private fun frameIntervalNanos(): Long {
    val rate = appContext.currentActivity?.let {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) it.display?.refreshRate else null
    } ?: 60f
    return (1_000_000_000.0 / rate.coerceAtLeast(1f)).toLong()
  }

  /** Thread ids in this process whose name is one of `names` */
  private fun threadsNamed(names: Set<String>): List<Int> =
    File("/proc/self/task").listFiles().orEmpty().mapNotNull { task ->
      val name = runCatching { File(task, "comm").readText().trim() }.getOrNull()
      if (name in names) task.name.toIntOrNull() else null
    }

  /**
   * Reports the main thread's CPU time per frame, from a Choreographer callback on the main
   * thread, and keeps the target at `share` of the current frame interval (the display may
   * switch rate)
   */
  @RequiresApi(Build.VERSION_CODES.S)
  private inner class FrameReporter(private val hints: PerformanceHintManager.Session) :
    Choreographer.FrameCallback {
    var share = 0.5
    private var running = false
    private var lastCpu = 0L
    private var target = 0L

    fun start() {
      if (running) return
      running = true
      lastCpu = Debug.threadCpuTimeNanos()
      Choreographer.getInstance().postFrameCallback(this)
    }

    fun stop() {
      running = false
      Choreographer.getInstance().removeFrameCallback(this)
    }

    override fun doFrame(frameTimeNanos: Long) {
      if (!running) return
      val cpu = Debug.threadCpuTimeNanos()
      val worked = cpu - lastCpu
      lastCpu = cpu
      val wanted = (frameIntervalNanos() * share).toLong()
      if (wanted != target) {
        target = wanted
        hints.updateTargetWorkDuration(target)
      }
      if (worked > 0) hints.reportActualWorkDuration(worked)
      Choreographer.getInstance().postFrameCallback(this)
    }
  }

  private companion object {
    /**
     * Besides the main thread: React Native's JS thread, by the names it has had, and Hermes's
     * garbage collector threads ("hades"). The UI runtime's collector matters most: the main
     * thread waits for it mid-frame, so it must not be left on the little cores either.
     */
    val SESSION_THREAD_NAMES = setOf("mqt_v_js", "mqt_js", "hades")
  }
}
