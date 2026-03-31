#!/usr/bin/env bash
set -euo pipefail

BOX_USER="${BOX_USER:-sphere86}"
DISPLAY_VAL="${SPHERE86_EMBEDDED_X11_DISPLAY:-:0}"
XDG_RUNTIME_DIR="/run/user/$(id -u "${BOX_USER}" 2>/dev/null || echo 1000)"
XVFB_SCREEN="${SPHERE86_XVFB_SCREEN:-1920x1080x24}"
PULSE_SERVER="unix:${XDG_RUNTIME_DIR}/pulse/native"
FORCE_XTEST_INPUT="${SPHERE86_FORCE_XTEST_INPUT:-false}"
USE_XORG="${SPHERE86_USE_XORG:-auto}"

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

run_bg() {
	"$@" &
	pids+=("$!")
}

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

should_use_xorg() {
	local mode="${USE_XORG,,}"
	if [[ "${mode}" == "true" || "${mode}" == "1" || "${mode}" == "yes" ]]; then
		return 0
	fi
	if [[ "${mode}" == "false" || "${mode}" == "0" || "${mode}" == "no" ]]; then
		return 1
	fi
	# auto: use Xorg if the dummy driver is available
	if command -v Xorg >/dev/null 2>&1 && [[ -f /app/scripts/container/xorg-dummy.conf ]]; then
		return 0
	fi
	return 1
}

start_udevd() {
	if [[ -f /app/scripts/container/99-input-permissions.rules ]]; then
		mkdir -p /etc/udev/rules.d
		cp -f /app/scripts/container/99-input-permissions.rules /etc/udev/rules.d/
	fi

	local udevd_bin=""
	for candidate in /usr/lib/systemd/systemd-udevd /lib/systemd/systemd-udevd /sbin/udevd /usr/sbin/udevd; do
		if [[ -x "${candidate}" ]]; then
			udevd_bin="${candidate}"
			break
		fi
	done
	command -v udevd >/dev/null 2>&1 && udevd_bin="$(command -v udevd)"

	if [[ -n "${udevd_bin}" ]]; then
		"${udevd_bin}" --daemon 2>/dev/null || "${udevd_bin}" -d 2>/dev/null || true
		sleep 0.5
		udevadm control --reload-rules 2>/dev/null || true
		udevadm trigger --subsystem-match=input --action=add 2>/dev/null || true
		udevadm settle --timeout=5 2>/dev/null || true
		log "udevd started (${udevd_bin}) for input hotplug."
	else
		log "WARNING: udevd not found. Input device hotplug will not work."
	fi
}

trigger_udev_input() {
	chmod 666 /dev/input/event* 2>/dev/null || true
	chmod 666 /dev/input/mice 2>/dev/null || true
	udevadm control --reload-rules 2>/dev/null || true
	udevadm trigger --subsystem-match=input --action=add 2>/dev/null || true
	udevadm trigger --subsystem-match=input --action=change 2>/dev/null || true
	udevadm settle --timeout=5 2>/dev/null || true
}

start_display_server() {
	if should_use_xorg; then
		log "Starting Xorg with dummy driver on ${DISPLAY_VAL}..."

		[[ -e /dev/tty0 ]] || mknod /dev/tty0 c 4 0 2>/dev/null || true
		chmod 666 /dev/tty0 2>/dev/null || true
		[[ -e /dev/tty7 ]] || mknod /dev/tty7 c 4 7 2>/dev/null || true
		chmod 666 /dev/tty7 2>/dev/null || true

		start_udevd

		run_bg Xorg "${DISPLAY_VAL}" vt7 \
			-noreset +extension GLX +extension RANDR +extension RENDER \
			-logfile /tmp/Xorg.log \
			-config /app/scripts/container/xorg-dummy.conf \
			-novtswitch -sharevts -nolisten tcp -ac
	else
		log "Starting Xvfb on ${DISPLAY_VAL} (${XVFB_SCREEN})..."
		run_as_user_bg "export DISPLAY='${DISPLAY_VAL}'; export XDG_RUNTIME_DIR='${XDG_RUNTIME_DIR}'; export PULSE_SERVER='${PULSE_SERVER}'; Xvfb '${DISPLAY_VAL}' -screen 0 '${XVFB_SCREEN}' -ac +extension GLX +extension XTEST +render -noreset"
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
	# Ensure existing /dev/input devices are accessible (host-passed and uinput-created).
	chmod 666 /dev/input/event* 2>/dev/null || true
	chmod 666 /dev/input/mice 2>/dev/null || true
	if [[ "${FORCE_XTEST_INPUT}" == "1" || "${FORCE_XTEST_INPUT}" == "true" || "${FORCE_XTEST_INPUT}" == "yes" ]]; then
		log "Forcing XTest-style input fallback (uinput/uhid blocked for BOX_USER)."
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

	start_display_server

	# Wait for the X socket to appear before launching window manager and Sunshine.
	local x_sock="/tmp/.X11-unix/X${DISPLAY_VAL#:}"
	local waited=0
	while [[ ! -e "${x_sock}" ]] && (( waited < 10 )); do
		sleep 1
		(( waited++ )) || true
	done
	if [[ ! -e "${x_sock}" ]]; then
		log "WARNING: X socket ${x_sock} not found after ${waited}s — continuing anyway."
	else
		log "X server ready (${x_sock} appeared after ~${waited}s)."
	fi

	# Xorg's udev monitor is now active. Re-trigger so it discovers pre-existing
	# /dev/input devices that were created before the X server started.
	if should_use_xorg; then
		log "Post-Xorg udev trigger for pre-existing input devices..."
		trigger_udev_input
		local pre_devs
		pre_devs="$(ls /dev/input/event* 2>/dev/null | wc -l)"
		log "Pre-existing input event devices: ${pre_devs}"
	fi

	log "Starting lightweight X session..."
	run_as_user_bg "export DISPLAY='${DISPLAY_VAL}'; export XDG_RUNTIME_DIR='${XDG_RUNTIME_DIR}'; export PULSE_SERVER='${PULSE_SERVER}'; dbus-launch --exit-with-session openbox"

	sleep 1
	log "Starting Sunshine..."
	run_as_user_bg "export DISPLAY='${DISPLAY_VAL}'; export XDG_RUNTIME_DIR='${XDG_RUNTIME_DIR}'; export PULSE_SERVER='${PULSE_SERVER}'; export XAUTHORITY='/home/${BOX_USER}/.Xauthority'; sunshine"

	# Sunshine creates virtual input devices (mouse, keyboard, gamepads) via uinput.
	# Wait for them, then trigger udev again so Xorg picks them up via libinput hotplug.
	if should_use_xorg; then
		sleep 4
		log "Post-Sunshine udev trigger for virtual input devices..."
		trigger_udev_input
		local post_devs
		post_devs="$(ls /dev/input/event* 2>/dev/null | wc -l)"
		log "Post-Sunshine input event devices: ${post_devs}"

		if command -v xinput >/dev/null 2>&1; then
			log "Xorg input devices (xinput list):"
			DISPLAY="${DISPLAY_VAL}" xinput list 2>/dev/null | while IFS= read -r line; do
				log "  ${line}"
			done || true
		fi

		# Verify that Xorg actually picked up slave input devices.
		local slave_count=0
		if command -v xinput >/dev/null 2>&1; then
			slave_count="$(DISPLAY="${DISPLAY_VAL}" xinput list 2>/dev/null | grep -c 'slave' || true)"
		fi
		if (( slave_count == 0 )); then
			log "WARNING: Xorg has no slave input devices. Checking udev database..."
			for d in /sys/class/input/event*; do
				[[ -e "${d}" ]] || continue
				local devname
				devname="$(basename "${d}")"
				local id_input
				id_input="$(udevadm info --query=property "${d}" 2>/dev/null | grep '^ID_INPUT=' || echo 'MISSING')"
				log "  /dev/input/${devname}: ${id_input}"
			done
		fi
	fi

	log "Starting Sphere86 app..."
	exec node /app/build
}

main "$@"
