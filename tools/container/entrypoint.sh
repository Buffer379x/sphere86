#!/usr/bin/env bash
set -euo pipefail

BOX_USER="${BOX_USER:-sphere86}"
DISPLAY_VAL="${SPHERE86_EMBEDDED_X11_DISPLAY:-:0}"
XDG_RUNTIME_DIR="/run/user/$(id -u "${BOX_USER}" 2>/dev/null || echo 1000)"
XVFB_SCREEN="${SPHERE86_XVFB_SCREEN:-1920x1080x24}"
PULSE_SERVER="unix:${XDG_RUNTIME_DIR}/pulse/native"

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

main() {
	/app/scripts/container/bootstrap-streaming-host.sh

	# Best-effort input modules/device setup for Sunshine virtual input.
	modprobe uinput 2>/dev/null || true
	modprobe uhid 2>/dev/null || true
	[[ -e /dev/uinput ]] || mknod /dev/uinput c 10 223 2>/dev/null || true
	[[ -e /dev/uhid ]] || mknod /dev/uhid c 10 239 2>/dev/null || true
	chmod 666 /dev/uinput 2>/dev/null || true
	chmod 666 /dev/uhid 2>/dev/null || true

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

