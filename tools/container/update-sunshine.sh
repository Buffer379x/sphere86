#!/usr/bin/env bash
set -euo pipefail

log() { echo "[sunshine-update] $*"; }

BOX_USER="${BOX_USER:-sphere86}"
BOX_HOME="/home/${BOX_USER}"
SUNSHINE_CONFIG_BASE="${SUNSHINE_CONFIG_BASE_PATH:-/data/sunshine}"
GITHUB_API_TOKEN="${GITHUB_API_TOKEN:-${GITHUB_TOKEN:-}}"

get_sunshine_version() {
	local log_file="/data/sunshine/config/sunshine.log"
	if [[ -f "${log_file}" ]]; then
		local from_log
		from_log="$(grep 'Sunshine version:' "${log_file}" | tail -1 | sed 's/.*Sunshine version:[[:space:]]*//' | grep -oE 'v[0-9]+\.[0-9]+[0-9.]*' | head -1 || true)"
		if [[ -n "${from_log}" ]]; then
			echo "${from_log}"
			return
		fi
	fi
	local from_dpkg
	from_dpkg="$(dpkg-query -W -f='${Version}' sunshine 2>/dev/null || true)"
	if [[ -n "${from_dpkg}" && "${from_dpkg}" != *"no packages"* ]]; then
		echo "${from_dpkg}"
		return
	fi
	sunshine --version 2>&1 | head -1 || true
}

old_version="$(get_sunshine_version)"
log "Current version: ${old_version:-unknown}"

log "Stopping Sunshine process..."
# Use -x to match exact process name only; -f would also kill this script
# since "sunshine" appears in its path (update-sunshine.sh).
pkill -x sunshine 2>/dev/null || true
sleep 2
pkill -9 -x sunshine 2>/dev/null || true
# Also kill any AppRun wrapper that might be the actual sunshine process
pkill -f '/opt/sunshine/appdir/AppRun' 2>/dev/null || true
sleep 1

log "Removing existing Sunshine installation..."
rm -f /usr/local/bin/sunshine
rm -rf /opt/sunshine/appdir /opt/sunshine/squashfs-root
dpkg --purge sunshine 2>/dev/null || true
apt-get -y autoremove 2>/dev/null || true

log "Installing latest Sunshine (fetching from GitHub)..."

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

find_deb_url_in_release() {
	# $1 = release JSON, $2 = arch
	# Try asset names in priority order for compatibility with our base image (Debian bookworm).
	local json="$1" arch="$2"
	local distro=""
	if [[ -f /etc/os-release ]]; then
		# shellcheck disable=SC1091
		source /etc/os-release
		distro="${VERSION_CODENAME:-}"
	fi
	local -a candidates=(
		"sunshine-debian-${distro}-${arch}.deb"
		"sunshine-ubuntu-24.04-${arch}.deb"
		"sunshine-ubuntu-22.04-${arch}.deb"
		"sunshine-debian-trixie-${arch}.deb"
	)
	for name in "${candidates[@]}"; do
		[[ -z "${name}" || "${name}" == *"--"* ]] && continue
		local found
		found="$(echo "${json}" | jq -r --arg n "${name}" '.assets[] | select(.name == $n) | .browser_download_url' 2>/dev/null | head -1)"
		if [[ -n "${found}" && "${found}" != "null" ]]; then
			log "Matched asset: ${name}"
			echo "${found}"
			return 0
		fi
	done
	return 1
}

install_sunshine_deb() {
	local api json url deb arch
	arch="$(dpkg --print-architecture)"
	api="https://api.github.com/repos/LizardByte/Sunshine/releases/latest"
	log "Fetching latest release info from GitHub..."
	json="$(curl_github_json "$api" 2>&1)" || {
		log "ERROR: GitHub API request failed: ${json}"
		return 1
	}

	local tag
	tag="$(echo "${json}" | jq -r '.tag_name // empty' 2>/dev/null || true)"
	log "Latest release: ${tag:-unknown}"
	log "Available .deb assets:"
	echo "${json}" | jq -r '.assets[].name' 2>/dev/null | grep -i '\.deb$' | while IFS= read -r a; do log "  ${a}"; done || true

	url="$(find_deb_url_in_release "${json}" "${arch}")" || true
	if [[ -z "${url}" || "${url}" == "null" ]]; then
		log "No compatible .deb in latest release for arch='${arch}'."
		return 1
	fi
	log "Downloading: ${url}"
	deb="/tmp/sunshine-update.deb"
	if ! curl -fsSL "$url" -o "$deb"; then
		log "ERROR: Download failed for ${url}"
		return 1
	fi
	log "Installing .deb package..."
	apt-get update -qq 2>&1 || true
	if ! apt-get install -y "$deb" 2>&1; then
		log "apt-get install failed, trying dpkg -i..."
		dpkg -i "$deb" 2>&1 || true
		apt-get install -f -y 2>&1 || true
	fi
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
	sunshine &" 2>&1 || log "WARNING: Failed to start Sunshine after update."

sleep 3
new_version="$(get_sunshine_version)"
log "Update complete: ${old_version:-unknown} -> ${new_version:-unknown}"
