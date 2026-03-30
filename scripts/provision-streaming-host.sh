#!/usr/bin/env bash
# Abwärtskompatibilität – bitte sphere86_install_wizard.sh verwenden.
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
exec bash "$SCRIPT_DIR/sphere86_install_wizard.sh" "$@"
