#!/usr/bin/env bash
set -euo pipefail

BOX_USER="${BOX_USER:-sphere86}"
DISPLAY_VAL="${SPHERE86_EMBEDDED_X11_DISPLAY:-:0}"
XDG_RUNTIME_DIR="/run/user/$(id -u "${BOX_USER}" 2>/dev/null || echo 1000)"
XVFB_SCREEN="${SPHERE86_XVFB_SCREEN:-1920x1080x24}"
PULSE_SERVER="unix:${XDG_RUNTIME_DIR}/pulse/native"
FORCE_XTEST_INPUT="${SPHERE86_FORCE_XTEST_INPUT:-false}"

log() { echo "[entrypoint] $*"; }

pids=()

cleanup() {
	log "Stopping background services..."
	for pid in "${pids[@]:-}"; do
		kill "$pid" 2>/dev/null || true
	done
	wait || true
}
trap cleanup EXIT INT TERM

run_as_user_bg() {
	local cmd="$1"
	runuser -u "$BOX_USER" -- /bin/bash -lc "$cmd" &
	pids+=("$!")
}

check_input_device_access() {
	local dev="$1"
	python3 - "$dev" "$BOX_USER" <<'PY'
import os
import pwd
import stat
import sys

dev = sys.argv[1]
user = sys.argv[2]

if not os.path.exists(dev):
    print(f"[entrypoint] Input device missing: {dev}")
    sys.exit(0)

st = os.stat(dev)
mode = stat.S_IMODE(st.st_mode)
owner = st.st_uid
group = st.st_gid
print(f"[entrypoint] Input device present: {dev} mode={oct(mode)} uid={owner} gid={group}")

try:
    pw = pwd.getpwnam(user)
except KeyError:
    print(f"[entrypoint] User not found for input probe: {user}")
    sys.exit(0)

uid = pw.pw_uid
gids = os.getgrouplist(user, pw.pw_gid)

allowed = False
if uid == owner and mode & 0o600:
    allowed = True
elif group in gids and mode & 0o060:
    allowed = True
elif mode & 0o006:
    allowed = True

if not allowed:
    print(f"[entrypoint] WARNING: {user} likely cannot access {dev} (permission bits).")
PY

	# Real open test as BOX_USER catches cgroup/device policy denials.
	if runuser -u "$BOX_USER" -- python3 - "$dev" <<'PY'
import os, sys
dev = sys.argv[1]
fd = os.open(dev, os.O_RDWR | os.O_NONBLOCK)
os.close(fd)
PY
	then
		log "Input probe success: ${BOX_USER} can open ${dev}"
	else
		log "WARNING: ${BOX_USER} cannot open ${dev}. Mouse/keyboard passthrough will not work."
	fi
}

main() {
	/app/scripts/container/bootstrap-streaming-host.sh

	# Best-effort input modules/device setup for Sunshine virtual input.
	modprobe uinput 2>/dev/null || true
	modprobe uhid 2>/dev/null || true
	[[ -e /dev/uinput ]] || mknod /dev/uinput c 10 223 2>/dev/null || true
	[[ -e /dev/uhid ]] || mknod /dev/uhid c 10 239 2>/dev/null || true
	chmod 666 /dev/uinput 2>/dev/null || true
	chmod 666 /dev/uhid 2>/dev/null || true
	if [[ "${FORCE_XTEST_INPUT}" == "1" || "${FORCE_XTEST_INPUT}" == "true" || "${FORCE_XTEST_INPUT}" == "yes" ]]; then
		log "Forcing Sunshine XTest-style input fallback (uinput/uhid disabled for BOX_USER)."
		chmod 000 /dev/uinput 2>/dev/null || true
		chmod 000 /dev/uhid 2>/dev/null || true
	fi
	check_input_device_access /dev/uinput
	check_input_device_access /dev/uhid

	# X/ICE socket dirs must exist with sticky bit before user-space X session starts.
	mkdir -p /tmp/.X11-unix /tmp/.ICE-unix
	chmod 1777 /tmp/.X11-unix /tmp/.ICE-unix

	# Optional system bus to reduce desktop component warnings.
	if command -v dbus-daemon >/dev/null 2>&1; then
		mkdir -p /run/dbus
		dbus-daemon --system --fork --nopidfile || true
	fi
	if command -v avahi-daemon >/dev/null 2>&1; then
		mkdir -p /run/avahi-daemon
		avahi-daemon --daemonize --no-drop-root || true
	fi

	mkdir -p "${XDG_RUNTIME_DIR}"
	chown "${BOX_USER}:${BOX_USER}" "${XDG_RUNTIME_DIR}"
	chmod 700 "${XDG_RUNTIME_DIR}"
	mkdir -p "${XDG_RUNTIME_DIR}/pulse"
	chown -R "${BOX_USER}:${BOX_USER}" "${XDG_RUNTIME_DIR}/pulse"

	# User PulseAudio instance for Sunshine capture + guest audio output.
	log "Starting PulseAudio..."
	run_as_user_bg "export XDG_RUNTIME_DIR='${XDG_RUNTIME_DIR}'; pulseaudio --daemonize=yes --exit-idle-time=-1 --log-target=stderr"

	log "Starting Xvfb on ${DISPLAY_VAL} (${XVFB_SCREEN})..."
	run_as_user_bg "export DISPLAY='${DISPLAY_VAL}'; export XDG_RUNTIME_DIR='${XDG_RUNTIME_DIR}'; export PULSE_SERVER='${PULSE_SERVER}'; Xvfb '${DISPLAY_VAL}' -screen 0 '${XVFB_SCREEN}' -ac +extension GLX +render -noreset"

	sleep 1
	log "Starting lightweight X session..."
	run_as_user_bg "export DISPLAY='${DISPLAY_VAL}'; export XDG_RUNTIME_DIR='${XDG_RUNTIME_DIR}'; export PULSE_SERVER='${PULSE_SERVER}'; dbus-launch --exit-with-session openbox"

	sleep 2
	log "Starting Sunshine..."
	run_as_user_bg "export DISPLAY='${DISPLAY_VAL}'; export XDG_RUNTIME_DIR='${XDG_RUNTIME_DIR}'; export PULSE_SERVER='${PULSE_SERVER}'; export XAUTHORITY='/home/${BOX_USER}/.Xauthority'; sunshine"

	log "Starting Sphere86 app..."
	exec node /app/build
}

main "$@"

