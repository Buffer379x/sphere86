#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -lt 5 ]]; then
	echo "usage: run-86box.sh <binary> <config> <roms> <display> <fullscreen:0|1>" >&2
	exit 2
fi

BINARY_PATH="$1"
CONFIG_PATH="$2"
ROMS_PATH="$3"
DISPLAY_VAL="$4"
FULLSCREEN="$5"

VM_DIR="$(dirname "$CONFIG_PATH")"
LOG_DIR="${VM_DIR}/logs"
WRAPPER_LOG="${LOG_DIR}/86box-wrapper.log"
EMU_LOG="${LOG_DIR}/86box-sphere86.log"

mkdir -p "$LOG_DIR"

{
	echo "[$(date -Iseconds)] starting 86Box"
	echo "binary=$BINARY_PATH"
	echo "config=$CONFIG_PATH"
	echo "roms=$ROMS_PATH"
	echo "display=$DISPLAY_VAL"
	echo "vm_dir=$VM_DIR"
} >> "$WRAPPER_LOG"

set +e
if [[ "$FULLSCREEN" == "1" ]]; then
	env DISPLAY="$DISPLAY_VAL" QT_QPA_PLATFORM=xcb XAUTHORITY="${XAUTHORITY:-$HOME/.Xauthority}" \
		"$BINARY_PATH" -R "$ROMS_PATH" -C "$CONFIG_PATH" -L "$EMU_LOG" -F >> "$WRAPPER_LOG" 2>&1
else
	env DISPLAY="$DISPLAY_VAL" QT_QPA_PLATFORM=xcb XAUTHORITY="${XAUTHORITY:-$HOME/.Xauthority}" \
		"$BINARY_PATH" -R "$ROMS_PATH" -C "$CONFIG_PATH" -L "$EMU_LOG" >> "$WRAPPER_LOG" 2>&1
fi
STATUS=$?
set -e

echo "[$(date -Iseconds)] 86Box exited with status=${STATUS}" >> "$WRAPPER_LOG"
exit "$STATUS"

