#!/usr/bin/env bash
# Shared by the Android bench scripts: keeps a bench honest about the phone it runs on. Source it,
# don't run it. A bench build keeps drawing behind the lock screen, so a run on a locked phone
# measures nothing and looks like a run that did.

PACKAGE=com.johanssoninteractive.tiltling

phone_locked() {
	adb shell dumpsys window | grep -q 'isKeyguardShowing=true'
}

# Keep the screen on while the phone is on USB, and stop if it is locked now
phone_ready() {
	adb shell svc power stayon usb
	if phone_locked; then
		echo "the phone is locked: unlock it and rerun" >&2
		exit 3
	fi
}

# Wait (up to $1 seconds, default 600) for someone to unlock the phone
wait_unlocked() {
	local left=${1:-600}
	adb shell svc power stayon usb
	if phone_locked; then echo "unlock the phone to go on..."; fi
	while phone_locked; do
		if [ "$left" -le 0 ]; then
			echo "the phone stayed locked: stopping" >&2
			exit 3
		fi
		sleep 5
		left=$((left - 5))
	done
}

app_alive() {
	adb shell pidof "$PACKAGE" >/dev/null
}

# Stop with the crash log when the app is gone, and when the phone has locked
still_measuring() {
	if ! app_alive; then
		echo "the app died: last crash log lines follow" >&2
		adb logcat -d -b crash | tail -20 >&2
		exit 4
	fi
	if phone_locked; then
		adb shell am force-stop "$PACKAGE"
		echo "the phone locked mid-run: stopping, the numbers would be from behind the lock screen" >&2
		exit 3
	fi
}

# Sleep $1 seconds, checking every 10 s that the run is still a run
measure_for() {
	local left=$1
	while [ "$left" -gt 0 ]; do
		local step=$((left < 10 ? left : 10))
		sleep "$step"
		left=$((left - step))
		still_measuring
	done
}

# Perfetto's trace_processor: $TRACE_PROCESSOR, else on PATH, else ~/.local/perfetto
find_trace_processor() {
	local tp=${TRACE_PROCESSOR:-$(command -v trace_processor || true)}
	if [ -z "$tp" ] && [ -x "$HOME/.local/perfetto/trace_processor" ]; then
		tp="$HOME/.local/perfetto/trace_processor"
	fi
	if [ -n "$tp" ] && [ ! -x "$tp" ]; then
		echo "TRACE_PROCESSOR is not an executable: $tp" >&2
		exit 1
	fi
	echo "$tp"
}
