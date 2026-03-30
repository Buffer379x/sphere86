#!/usr/bin/env bash
# Backward compatibility entrypoint for legacy name.
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
exec bash "$SCRIPT_DIR/sphere86-install-wizard.sh" "$@"
