#!/usr/bin/env bash
set -euo pipefail

log() { echo "[bootstrap] $*"; }

BOX_USER="${BOX_USER:-sphere86}"
BOX_HOME="/home/${BOX_USER}"
DISPLAY_VAL="${SPHERE86_EMBEDDED_X11_DISPLAY:-:0}"
SUNSHINE_STREAM_PORT="${SUNSHINE_STREAM_PORT:-47989}"
APP_DATA_ROOT="${SPHERE86_DATA_ROOT:-/data/sphere86}"
CONFIG_BASE="${SPHERE86_EMBEDDED_CONFIG_BASE_PATH:-/data/86box}"
SUNSHINE_CONFIG_BASE="${SUNSHINE_CONFIG_BASE_PATH:-/data/sunshine}"
ROMS_PATH="${BOX86_ROMS_PATH:-/opt/86box/roms}"
BOX86_BINARY_PATH="${BOX86_BINARY_PATH:-/usr/local/bin/86Box}"
SUNSHINE_UI_USER="${SUNSHINE_WEB_USERNAME:-admin}"
SUNSHINE_UI_PASS="${SUNSHINE_WEB_PASSWORD:-sunshine}"
SUNSHINE_INSTALL_METHOD="${SUNSHINE_INSTALL_METHOD:-auto}" # auto|deb|appimage
GITHUB_API_TOKEN="${GITHUB_API_TOKEN:-${GITHUB_TOKEN:-}}"

SUNSHINE_URL_CACHE_DIR="${APP_DATA_ROOT}/cache/sunshine"
SUNSHINE_DEB_URL_CACHE="${SUNSHINE_URL_CACHE_DIR}/deb-url.txt"
SUNSHINE_APPIMAGE_URL_CACHE="${SUNSHINE_URL_CACHE_DIR}/appimage-url.txt"

curl_github_json() {
	# $1 = GitHub API URL
	local url="$1"
	local -a args
	args=(
		-fsSL
		--retry 3
		--retry-delay 1
		-H "Accept: application/vnd.github+json"
		-H "X-GitHub-Api-Version: 2022-11-28"
		-H "User-Agent: sphere86-bootstrap"
	)
	if [[ -n "${GITHUB_API_TOKEN}" ]]; then
		args+=(-H "Authorization: Bearer ${GITHUB_API_TOKEN}")
	fi
	curl "${args[@]}" "${url}"
}

read_cached_url() {
	# $1 = cache-file path
	local f="$1"
	[[ -f "${f}" ]] || return 1
	local u
	u="$(sed -n '1p' "${f}" | tr -d '\r' | xargs)"
	[[ -n "${u}" ]] || return 1
	printf '%s\n' "${u}"
}

write_cached_url() {
	# $1 = cache-file path, $2 = url
	local f="$1"
	local u="$2"
	mkdir -p "$(dirname "${f}")"
	printf '%s\n' "${u}" > "${f}"
}

sunshine_binary_path() {
	command -v sunshine 2>/dev/null || true
}

sunshine_runtime_ok() {
	local bin
	bin="$(sunshine_binary_path)"
	[[ -n "${bin}" ]] || return 1
	ldd "${bin}" 2>/dev/null | grep -q "not found" && return 1
	return 0
}

install_sunshine_appimage() {
	log "Installing Sunshine AppImage fallback..."
	local api json url arch file app_root
	arch="$(dpkg --print-architecture)"
	api="https://api.github.com/repos/LizardByte/Sunshine/releases/latest"
	json="$(curl_github_json "$api" 2>/dev/null || true)"
	url="${SUNSHINE_APPIMAGE_URL:-}"
	if [[ -z "${url}" ]]; then
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
	fi
	if [[ -z "${url}" || "${url}" == "null" ]]; then
		url="$(read_cached_url "${SUNSHINE_APPIMAGE_URL_CACHE}" 2>/dev/null || true)"
	fi
	if [[ -z "${url}" || "${url}" == "null" ]]; then
		log "No Sunshine AppImage found for arch='${arch}'."
		return 1
	fi
	log "Using Sunshine AppImage: ${url}"
	file="/tmp/sunshine.AppImage"
	app_root="/opt/sunshine/appdir"
	mkdir -p /opt/sunshine
	curl -fsSL "${url}" -o "${file}"
	chmod +x "${file}"

	# Avoid FUSE requirements in containers: extract once and run AppRun directly.
	rm -rf /opt/sunshine/squashfs-root "${app_root}"
	(
		cd /opt/sunshine
		"${file}" --appimage-extract >/dev/null
	)
	if [[ ! -x /opt/sunshine/squashfs-root/AppRun ]]; then
		log "AppImage extraction failed (AppRun missing)."
		return 1
	fi
	mv /opt/sunshine/squashfs-root "${app_root}"
	rm -f "${file}"

	cat > /usr/local/bin/sunshine <<'EOF'
#!/usr/bin/env bash
exec /opt/sunshine/appdir/AppRun "$@"
EOF
	chmod +x /usr/local/bin/sunshine
	write_cached_url "${SUNSHINE_APPIMAGE_URL_CACHE}" "${url}"
}

install_sunshine_deb() {
	if command -v sunshine >/dev/null 2>&1; then
		log "Sunshine already present."
		return 0
	fi

	log "Installing Sunshine from release .deb..."
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
	url="${SUNSHINE_DEB_URL:-}"
	if [[ -z "${url}" ]]; then
		if [[ -n "${distro}" && -n "${json}" ]]; then
			# Prefer exact distro+arch naming for deterministic ABI compatibility.
			url="$(echo "$json" | jq -r --arg n "${asset_name}" '.assets[] | select(.name == $n) | .browser_download_url' | head -1)"
		fi
	fi
	if [[ -z "${url}" || "${url}" == "null" ]]; then
		# If latest no longer ships this distro asset (e.g. only trixie/ubuntu),
		# pick newest release that still has exact distro+arch package.
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
		url="$(read_cached_url "${SUNSHINE_DEB_URL_CACHE}" 2>/dev/null || true)"
		if [[ -n "${url}" ]]; then
			log "Using cached Sunshine .deb URL."
		fi
	fi
	if [[ -z "${url}" || "${url}" == "null" ]]; then
		# Deterministic fallback for bookworm/arm64 when GitHub API is rate-limited.
		if [[ "${distro}" == "bookworm" && "${arch}" == "arm64" ]]; then
			url="https://github.com/LizardByte/Sunshine/releases/download/v2025.628.4510/sunshine-debian-bookworm-arm64.deb"
			log "Using deterministic fallback Sunshine .deb URL for bookworm/arm64."
		fi
	fi
	if [[ -z "${url}" || "${url}" == "null" ]]; then
		log "No compatible Sunshine .deb asset found for distro='${distro:-unknown}' arch='${arch}'. Set SUNSHINE_DEB_URL explicitly."
		return 1
	fi
	log "Using Sunshine .deb: ${url}"
	deb="/tmp/sunshine.deb"
	curl -fsSL "$url" -o "$deb"
	apt-get update -qq
	apt-get install -y -qq "$deb" 2>/dev/null || { dpkg -i "$deb" || true; apt-get install -f -y -qq; }
	rm -f "$deb"
	write_cached_url "${SUNSHINE_DEB_URL_CACHE}" "${url}"
}

install_sunshine() {
	case "${SUNSHINE_INSTALL_METHOD}" in
		appimage)
			install_sunshine_appimage
			;;
		deb)
			install_sunshine_deb
			;;
		auto|*)
			install_sunshine_deb || true
			if ! sunshine_runtime_ok; then
				if [[ "$(dpkg --print-architecture)" == "arm64" ]]; then
					log "Sunshine .deb runtime dependencies unresolved on arm64. Configure SUNSHINE_DEB_URL to a known compatible build."
					return 1
				fi
				log "Sunshine .deb runtime dependencies unresolved; switching to AppImage."
				install_sunshine_appimage
			fi
			;;
	esac

	if ! sunshine_runtime_ok; then
		log "Sunshine installation failed: runtime dependencies unresolved."
		return 1
	fi
}

install_86box() {
	if [[ -x /usr/local/bin/86Box ]]; then
		if /usr/local/bin/86Box --help >/dev/null 2>&1; then
			log "86Box already present."
			return 0
		fi
		log "Existing 86Box binary is not runnable; reinstalling."
		rm -f /usr/local/bin/86Box
	fi

	log "Installing 86Box latest Linux/AppImage release..."
	local api json url file candidate
	api="https://api.github.com/repos/86Box/86Box/releases/latest"
	json="$(curl -fsSL "$api")"
	url="$(echo "$json" | jq -r '.assets[] | select(.name | test("Linux.*x86_64|\\.AppImage$")) | .browser_download_url' | head -1)"
	if [[ -z "${url}" || "${url}" == "null" ]]; then
		log "No 86Box Linux asset found."
		return 1
	fi
	file="/tmp/86box-asset"
	curl -fsSL "$url" -o "$file"
	mkdir -p /opt/86box/bin
	if [[ "${url}" == *.tar.gz ]]; then
		tar -xzf "$file" -C /opt/86box/bin
		candidate="$(ls -1 /opt/86box/bin/86Box* 2>/dev/null | head -1 || true)"
		if [[ -n "${candidate}" ]]; then
			chmod +x "${candidate}"
			ln -sf "${candidate}" /usr/local/bin/86Box
		fi
	else
		# AppImage cannot rely on FUSE inside many container runtimes. Extract once and run AppRun directly.
		chmod +x "$file"
		rm -rf /opt/86box/squashfs-root /opt/86box/86box-appdir
		(
			cd /opt/86box
			"$file" --appimage-extract >/dev/null
		)
		if [[ ! -x /opt/86box/squashfs-root/AppRun ]]; then
			log "86Box AppImage extraction failed (AppRun missing)."
			rm -f "$file"
			return 1
		fi
		mv /opt/86box/squashfs-root /opt/86box/86box-appdir
		cat > /usr/local/bin/86Box <<'EOF'
#!/usr/bin/env bash
exec /opt/86box/86box-appdir/AppRun "$@"
EOF
		chmod +x /usr/local/bin/86Box
	fi
	rm -f "$file" || true
}

ensure_user() {
	local group_csv="audio,video"
	getent group input >/dev/null 2>&1 && group_csv="${group_csv},input"
	getent group render >/dev/null 2>&1 && group_csv="${group_csv},render"

	if ! id "$BOX_USER" >/dev/null 2>&1; then
		log "Creating user ${BOX_USER}."
		useradd -m -s /bin/bash -G "$group_csv" "$BOX_USER"
	fi
	mkdir -p "${BOX_HOME}/.config" "${BOX_HOME}/.cache"
	rm -rf "${BOX_HOME}/.config/sunshine"
	ln -sfn "${SUNSHINE_CONFIG_BASE}/config" "${BOX_HOME}/.config/sunshine"
	chown -R "${BOX_USER}:${BOX_USER}" "${BOX_HOME}"
}

write_sunshine_config() {
	log "Writing Sunshine config."
	cat > "${BOX_HOME}/.config/sunshine/sunshine.conf" <<EOF
origin_web_ui_allowed = lan
upnp = off
port = ${SUNSHINE_STREAM_PORT}
system_tray = disabled
EOF
	chown -R "${BOX_USER}:${BOX_USER}" "${BOX_HOME}/.config"
}

set_sunshine_creds() {
	if ! command -v sunshine >/dev/null 2>&1; then
		return 0
	fi
	log "Setting Sunshine Web UI credentials."
	runuser -u "$BOX_USER" -- sunshine --creds "$SUNSHINE_UI_USER" "$SUNSHINE_UI_PASS" >/dev/null 2>&1 || true
}

ensure_sunshine_runtime_compat() {
	# Some Sunshine builds require libminiupnpc.so.18 while Debian Bookworm ships .so.17.
	# Create a compatibility symlink if needed so Sunshine can start.
	if [[ -e /usr/lib/aarch64-linux-gnu/libminiupnpc.so.18 || -e /usr/lib/x86_64-linux-gnu/libminiupnpc.so.18 ]]; then
		return 0
	fi

	local found
	found="$(ldconfig -p 2>/dev/null | awk '/libminiupnpc\.so\.17/{print $NF; exit}')"
	if [[ -n "${found}" && -e "${found}" ]]; then
		ln -sfn "${found}" "${found%.17}.18"
		log "Created compatibility symlink: ${found%.17}.18 -> ${found}"
	fi
}

prepare_data_layout() {
	log "Preparing /data layout."
	mkdir -p "${APP_DATA_ROOT}/config" "${APP_DATA_ROOT}/logs" "${APP_DATA_ROOT}/cache"
	mkdir -p "${SUNSHINE_CONFIG_BASE}/config"
	mkdir -p "${CONFIG_BASE}" "${CONFIG_BASE}/vms" "${CONFIG_BASE}/roms"
	# One-time compatibility move from older layout where VMs/ROMs lived under SPHERE86_DATA_ROOT.
	if [[ -d "${APP_DATA_ROOT}/vms" ]] && [[ -z "$(ls -A "${CONFIG_BASE}/vms" 2>/dev/null || true)" ]]; then
		mv "${APP_DATA_ROOT}/vms/." "${CONFIG_BASE}/vms/" 2>/dev/null || true
	fi
	if [[ -d "${APP_DATA_ROOT}/roms" ]] && [[ -z "$(ls -A "${CONFIG_BASE}/roms" 2>/dev/null || true)" ]]; then
		mv "${APP_DATA_ROOT}/roms/." "${CONFIG_BASE}/roms/" 2>/dev/null || true
	fi
	mkdir -p "$(dirname "${ROMS_PATH}")"
	ln -sfn "${CONFIG_BASE}/roms" "${ROMS_PATH}"
	chown -R "${BOX_USER}:${BOX_USER}" "${APP_DATA_ROOT}" || true
	chown -R "${BOX_USER}:${BOX_USER}" "${SUNSHINE_CONFIG_BASE}" || true
	chown -R "${BOX_USER}:${BOX_USER}" "${CONFIG_BASE}" || true
}

main() {
	install_sunshine
	install_86box
	ensure_user
	prepare_data_layout
	write_sunshine_config
	set_sunshine_creds
	ensure_sunshine_runtime_compat
	log "Bootstrap complete (DISPLAY=${DISPLAY_VAL})."
}

main "$@"

