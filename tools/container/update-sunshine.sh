#!/usr/bin/env bash
set -euo pipefail

log() { echo "[sunshine-update] $*"; }

BOX_USER="${BOX_USER:-sphere86}"
BOX_HOME="/home/${BOX_USER}"
SUNSHINE_CONFIG_BASE="${SUNSHINE_CONFIG_BASE_PATH:-/data/sunshine}"
GITHUB_API_TOKEN="${GITHUB_API_TOKEN:-${GITHUB_TOKEN:-}}"

old_version=""
if command -v sunshine >/dev/null 2>&1; then
	old_version="$(sunshine --version 2>&1 | head -1 || true)"
fi
log "Current version: ${old_version:-unknown}"

log "Stopping Sunshine process..."
pkill -f sunshine 2>/dev/null || true
sleep 2
pkill -9 -f sunshine 2>/dev/null || true

log "Removing existing Sunshine installation..."
rm -f /usr/local/bin/sunshine
rm -rf /opt/sunshine/appdir /opt/sunshine/squashfs-root
dpkg --purge sunshine 2>/dev/null || true
apt-get -y autoremove 2>/dev/null || true

log "Installing latest Sunshine..."

curl_github_json() {
	local url="$1"
	local -a args
	args=(
		-fsSL
		--retry 3
		--retry-delay 1
		-H "Accept: application/vnd.github+json"
		-H "X-GitHub-Api-Version: 2022-11-28"
		-H "User-Agent: sphere86-updater"
	)
	if [[ -n "${GITHUB_API_TOKEN}" ]]; then
		args+=(-H "Authorization: Bearer ${GITHUB_API_TOKEN}")
	fi
	curl "${args[@]}" "${url}"
}

install_sunshine_deb() {
	local api json url deb arch distro asset_name releases_json
	arch="$(dpkg --print-architecture)"
	distro="${DISTRO_CODENAME:-}"
	if [[ -z "${distro}" && -f /etc/os-release ]]; then
		# shellcheck disable=SC1091
		source /etc/os-release
		distro="${VERSION_CODENAME:-}"
	fi
	asset_name="sunshine-debian-${distro}-${arch}.deb"
	api="https://api.github.com/repos/LizardByte/Sunshine/releases/latest"
	json="$(curl_github_json "$api" 2>/dev/null || true)"
	url=""
	if [[ -n "${distro}" && -n "${json}" ]]; then
		url="$(echo "$json" | jq -r --arg n "${asset_name}" '.assets[] | select(.name == $n) | .browser_download_url' | head -1)"
	fi
	if [[ -z "${url}" || "${url}" == "null" ]]; then
		releases_json="$(curl_github_json "https://api.github.com/repos/LizardByte/Sunshine/releases?per_page=100" 2>/dev/null || true)"
		if [[ -n "${releases_json}" ]]; then
			url="$(echo "$releases_json" | jq -r --arg n "${asset_name}" '
				.[]
				| .assets[]?
				| select(.name == $n)
				| .browser_download_url
			' | head -1)"
		fi
	fi
	if [[ -z "${url}" || "${url}" == "null" ]]; then
		log "No compatible Sunshine .deb found for distro='${distro:-unknown}' arch='${arch}'."
		return 1
	fi
	log "Downloading: ${url}"
	deb="/tmp/sunshine-update.deb"
	curl -fsSL "$url" -o "$deb"
	apt-get update -qq
	apt-get install -y -qq "$deb" 2>/dev/null || { dpkg -i "$deb" || true; apt-get install -f -y -qq; }
	rm -f "$deb"
}

install_sunshine_appimage() {
	local api json url arch file app_root
	arch="$(dpkg --print-architecture)"
	api="https://api.github.com/repos/LizardByte/Sunshine/releases/latest"
	json="$(curl_github_json "$api" 2>/dev/null || true)"
	url=""
	if [[ -n "${json}" ]]; then
		url="$(echo "$json" | jq -r --arg arch "${arch}" '
			.assets[]
			| select(
				(.name | ascii_downcase | endswith(".appimage")) and
				(
					($arch == "arm64" and (.name | ascii_downcase | test("aarch64|arm64"))) or
					($arch == "amd64" and ((.name | ascii_downcase | test("x86_64|amd64")) or (.name | ascii_downcase == "sunshine.appimage")))
				)
			)
			| .browser_download_url
		' | head -1)"
	fi
	if [[ -z "${url}" || "${url}" == "null" ]]; then
		log "No Sunshine AppImage found for arch='${arch}'."
		return 1
	fi
	log "Downloading AppImage: ${url}"
	file="/tmp/sunshine-update.AppImage"
	app_root="/opt/sunshine/appdir"
	mkdir -p /opt/sunshine
	curl -fsSL "${url}" -o "${file}"
	chmod +x "${file}"
	rm -rf /opt/sunshine/squashfs-root "${app_root}"
	(cd /opt/sunshine && "${file}" --appimage-extract >/dev/null)
	if [[ ! -x /opt/sunshine/squashfs-root/AppRun ]]; then
		log "AppImage extraction failed."
		return 1
	fi
	mv /opt/sunshine/squashfs-root "${app_root}"
	rm -f "${file}"
	cat > /usr/local/bin/sunshine <<'EOF'
#!/usr/bin/env bash
exec /opt/sunshine/appdir/AppRun "$@"
EOF
	chmod +x /usr/local/bin/sunshine
}

if ! install_sunshine_deb; then
	log ".deb install failed, trying AppImage..."
	install_sunshine_appimage
fi

if ! command -v sunshine >/dev/null 2>&1; then
	log "ERROR: Sunshine installation failed."
	exit 1
fi

new_version="$(sunshine --version 2>&1 | head -1 || true)"
log "Installed version: ${new_version:-unknown}"

log "Ensuring config symlink..."
rm -rf "${BOX_HOME}/.config/sunshine"
ln -sfn "${SUNSHINE_CONFIG_BASE}/config" "${BOX_HOME}/.config/sunshine"
chown -R "${BOX_USER}:${BOX_USER}" "${BOX_HOME}/.config"

# miniupnpc compat shim
if [[ ! -e /usr/lib/x86_64-linux-gnu/libminiupnpc.so.18 ]] && [[ ! -e /usr/lib/aarch64-linux-gnu/libminiupnpc.so.18 ]]; then
	found="$(ldconfig -p 2>/dev/null | awk '/libminiupnpc\.so\.17/{print $NF; exit}')"
	if [[ -n "${found}" && -e "${found}" ]]; then
		ln -sfn "${found}" "${found%.17}.18"
		log "Created compat symlink: ${found%.17}.18"
	fi
fi

log "Restarting Sunshine..."
DISPLAY_VAL="${SPHERE86_EMBEDDED_X11_DISPLAY:-:0}"
XDG_RUNTIME_DIR="/run/user/$(id -u "${BOX_USER}" 2>/dev/null || echo 1000)"
PULSE_SERVER="unix:${XDG_RUNTIME_DIR}/pulse/native"

runuser -u "$BOX_USER" -- /bin/bash -lc "\
	export DISPLAY='${DISPLAY_VAL}'; \
	export XDG_RUNTIME_DIR='${XDG_RUNTIME_DIR}'; \
	export PULSE_SERVER='${PULSE_SERVER}'; \
	export XAUTHORITY='/home/${BOX_USER}/.Xauthority'; \
	sunshine &" 2>/dev/null

log "Update complete: ${old_version:-unknown} -> ${new_version:-unknown}"
