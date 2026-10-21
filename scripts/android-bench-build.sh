#!/usr/bin/env bash
# Build a release bench APK of the checked-out commit and save it, for scripts/android-ab-bench.sh.
#
# Usage (from the repo root of the checkout to build, any worktree):
#
#     scripts/android-bench-build.sh <out.apk> [run]
#
#   run  the bench run to build in (src/application/bench.ts): steady (default) or drips
#
# The machine's JDK and SDK paths come from scripts/android.env (gitignored; copy
# scripts/android.env.example). Skia and worklets need JDK 17: newer JDKs, Android Studio's
# bundled one included, break their CMake step.
#
# Builds from a clean JS bundle every time. EXPO_PUBLIC_BENCH is inlined when Metro transforms
# App.tsx, and neither Metro's cache nor Gradle counts an environment variable as an input, so
# without the cleaning a build quietly ships the previous run's bundle. Creates android/ with
# expo prebuild when the checkout has none (it is gitignored, so new worktrees lack it).
set -euo pipefail

OUT=${1:?usage: scripts/android-bench-build.sh <out.apk> [steady|drips]}
RUN=${2:-steady}
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ ! -f scripts/android.env ]; then
	echo "scripts/android.env is missing: copy scripts/android.env.example and fill in the paths" >&2
	exit 1
fi
source scripts/android.env
export JAVA_HOME ANDROID_HOME

case "$RUN" in
steady) BENCH=1 ;;
drips) BENCH=drips ;;
*)
	echo "unknown run: $RUN (steady or drips)" >&2
	exit 1
	;;
esac

if [ ! -d android ]; then
	CI=1 pnpm exec expo prebuild --platform android --no-install
fi

rm -rf "${TMPDIR:-/tmp}"/metro-cache node_modules/.cache \
	android/app/build/generated/assets/react/release \
	android/app/build/intermediates/assets/release \
	android/app/build/outputs/apk/release

(cd android && EXPO_PUBLIC_BENCH=$BENCH CI=1 ./gradlew --quiet app:assembleRelease)

cp android/app/build/outputs/apk/release/app-release.apk "$OUT"
echo "$(git rev-parse --short HEAD)$(git diff --quiet HEAD || echo '+uncommitted') ($RUN) -> $OUT, md5 $(md5 -q "$OUT")"
