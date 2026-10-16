package expo.modules.threadaffinity

import android.os.Process
import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

class ThreadAffinityModule : Module() {
  /** The CPUs the main thread is kept on, once pinned; re-applied when the app comes back */
  private var pinned: IntArray? = null

  override fun definition() = ModuleDefinition {
    Name("ThreadAffinity")

    // Keep the app's main thread (the UI runtime's worklets and Skia's renders) off the slowest
    // cluster: a tilt game sends no touches, so Android's input boost never moves it there.
    // Resolves the CPUs it was limited to, or an empty list when the cores are all alike, their
    // speeds can't be read, or the call fails.
    AsyncFunction("pinMainThreadToFastCores") {
      val cpus = fastCores() ?: return@AsyncFunction emptyList<Int>()
      if (!apply(cpus)) return@AsyncFunction emptyList<Int>()
      pinned = cpus
      cpus.toList()
    }

    // Leaving the foreground can move the app to a cpuset without the fast cores, and the
    // kernel then drops the limit; put it back on return
    OnActivityEntersForeground { pinned?.let { apply(it) } }
  }

  private fun apply(cpus: IntArray): Boolean {
    val error = setAffinity(Process.myPid(), cpus)
    if (error != 0) Log.w(TAG, "sched_setaffinity failed: errno $error")
    else Log.i(TAG, "main thread limited to CPUs ${cpus.joinToString()}")
    return error == 0
  }

  /** Every CPU faster than the slowest cluster, by its top frequency; null if none or unreadable */
  private fun fastCores(): IntArray? {
    val count = Runtime.getRuntime().availableProcessors()
    val speeds = (0 until count).map { cpu ->
      File("/sys/devices/system/cpu/cpu$cpu/cpufreq/cpuinfo_max_freq")
        .runCatching { readText().trim().toLong() }
        .getOrNull() ?: return null
    }
    val slowest = speeds.minOrNull() ?: return null
    val fast = speeds.indices.filter { speeds[it] > slowest }
    return if (fast.isEmpty()) null else fast.toIntArray()
  }

  private external fun setAffinity(tid: Int, cpus: IntArray): Int

  companion object {
    private const val TAG = "ThreadAffinity"

    init {
      System.loadLibrary("threadaffinity")
    }
  }
}
