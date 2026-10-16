#include <cerrno>
#include <jni.h>
#include <sched.h>

// Limits the thread `tid` of this process to the CPUs in `cpus`. Any thread of the app may set
// its own threads' affinity; no permission is needed. Returns 0, or the errno it failed with.
extern "C" JNIEXPORT jint JNICALL
Java_expo_modules_threadaffinity_ThreadAffinityModule_setAffinity(JNIEnv *env, jobject,
                                                                  jint tid, jintArray cpus) {
  cpu_set_t set;
  CPU_ZERO(&set);
  const jsize count = env->GetArrayLength(cpus);
  jint *values = env->GetIntArrayElements(cpus, nullptr);
  for (jsize i = 0; i < count; i++) {
    if (values[i] >= 0 && values[i] < CPU_SETSIZE) CPU_SET(values[i], &set);
  }
  env->ReleaseIntArrayElements(cpus, values, JNI_ABORT);
  return sched_setaffinity(tid, sizeof(set), &set) == 0 ? 0 : errno;
}
