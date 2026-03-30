#!/usr/bin/env bash
#
# Sphere86 – Installations-Wizard (Streaming-Host)
#
# Debian 12 / Ubuntu 22.04+ (root/sudo).
# ROMs werden nicht heruntergeladen – Verwaltung über das Sphere86-Webpanel.
#
#   sudo bash scripts/sphere86_install_wizard.sh
#

set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

COLOR_CYAN='\033[0;36m'
COLOR_GREEN='\033[0;32m'
COLOR_YELLOW='\033[1;33m'
COLOR_RED='\033[0;31m'
COLOR_DIM='\033[0;90m'
COLOR_NC='\033[0m'

SPHERE86_CONF_DIR="/etc/sphere86"
INSTALL_CONF="${SPHERE86_CONF_DIR}/install.conf"
SUNSHINE_UNIT="sphere86-sunshine.service"

log()  { echo -e "${COLOR_CYAN}[Sphere86]${COLOR_NC} $*"; }
ok()   { echo -e "${COLOR_GREEN}[  OK  ]${COLOR_NC} $*"; }
warn() { echo -e "${COLOR_YELLOW}[ WARN ]${COLOR_NC} $*"; }
err()  { echo -e "${COLOR_RED}[ERROR ]${COLOR_NC} $*"; }

# --- Zusammenfassung (Passed / Failed) --------------------------------------
declare -a WIZARD_STEPS=()
declare -a WIZARD_OK=()

wizard_reset() {
	WIZARD_STEPS=()
	WIZARD_OK=()
}

# $1 = Beschreibung, $2 = 0 = passed, 1 = failed
wizard_add() {
	WIZARD_STEPS+=("$1")
	WIZARD_OK+=("$2")
}

wizard_print_summary() {
	local i passed=0 failed=0
	echo ""
	log "=========================================="
	log "  Zusammenfassung"
	log "=========================================="
	for i in "${!WIZARD_STEPS[@]}"; do
		if [[ "${WIZARD_OK[$i]}" == "0" ]]; then
			echo -e "  ${COLOR_GREEN}PASSED${COLOR_NC}  ${WIZARD_STEPS[$i]}"
			((passed++)) || true
		else
			echo -e "  ${COLOR_RED}FAILED${COLOR_NC} ${WIZARD_STEPS[$i]}"
			((failed++)) || true
		fi
	done
	echo ""
	if [[ $failed -eq 0 ]]; then
		ok "Alle Schritte erfolgreich ($passed)."
	else
		err "$failed Schritt(e) fehlgeschlagen, $passed bestanden."
	fi
	echo ""
}

# --- Konfiguration (persistente Metadaten, keine Passwörter) -----------------
BOX_USER="${BOX_USER:-sphere86}"
CONFIG_PATH="${CONFIG_PATH:-/opt/86box/configs}"
HOSTNAME_INPUT="${HOSTNAME_INPUT:-streaming-host}"
SHARE_ADDR="${SHARE_ADDR:-}"
SHARE_TYPE="${SHARE_TYPE:-smb}"
SMB_USER="${SMB_USER:-}"
SMB_PASS="${SMB_PASS:-}"
SMB_DOMAIN="${SMB_DOMAIN:-}"
SUNSHINE_PASS="${SUNSHINE_PASS:-sunshine}"
STATIC_IP="${STATIC_IP:-}"
BOX_PASS="${BOX_PASS:-sphere86}"

save_install_conf() {
	mkdir -p "$SPHERE86_CONF_DIR"
	umask 077
	cat > "$INSTALL_CONF" <<EOF
# Sphere86 Install-Wizard (keine Passwörter; nur Referenz)
HOSTNAME_INPUT=$HOSTNAME_INPUT
BOX_USER=$BOX_USER
CONFIG_PATH=$CONFIG_PATH
SHARE_ADDR=$SHARE_ADDR
SHARE_TYPE=$SHARE_TYPE
SMB_USER=$SMB_USER
SMB_DOMAIN=$SMB_DOMAIN
STATIC_IP=$STATIC_IP
EOF
	chmod 600 "$INSTALL_CONF" 2>/dev/null || true
}

load_install_conf() {
	[[ -f "$INSTALL_CONF" ]] || return 1
	# shellcheck disable=SC1090
	source "$INSTALL_CONF"
	return 0
}

preflight_root() {
	if [[ $EUID -ne 0 ]]; then
		err "Bitte als root oder mit sudo ausführen."
		exit 1
	fi
}

# ---------------------------------------------------------------------------
# Paket-Basis (idempotent)
# ---------------------------------------------------------------------------
install_base_packages() {
	log "Installiere/aktualisiere Basispakete..."
	apt-get update -qq
	apt-get upgrade -y -qq
	echo "lightdm shared/default-x-display-manager select lightdm" | debconf-set-selections
	echo "lightdm lightdm/default-display-manager select lightdm" | debconf-set-selections
	apt-get install -y -qq \
		curl wget gnupg2 software-properties-common \
		xorg xfce4 lightdm dbus-x11 \
		pulseaudio \
		nfs-common cifs-utils \
		unzip tar jq
}

# ---------------------------------------------------------------------------
# Hostname & Benutzer
# ---------------------------------------------------------------------------
apply_hostname() {
	hostnamectl set-hostname "$HOSTNAME_INPUT"
}

ensure_user() {
	if ! id "$BOX_USER" &>/dev/null; then
		useradd -m -s /bin/bash -G audio,video,input,render "$BOX_USER"
		echo "$BOX_USER:$BOX_PASS" | chpasswd
	else
		warn "Benutzer $BOX_USER existiert bereits (Passwort unverändert)."
	fi
}

# ---------------------------------------------------------------------------
# Statische IP (Netplan)
# ---------------------------------------------------------------------------
apply_static_ip() {
	if [[ -z "$STATIC_IP" ]]; then
		return 0
	fi
	local IFACE
	IFACE=$(ip -br link | grep -v 'lo' | head -1 | awk '{print $1}')
	if ! command -v netplan &>/dev/null; then
		warn "Netplan nicht gefunden – IP manuell setzen."
		return 1
	fi
	cat > /etc/netplan/99-sphere86.yaml <<NETPLAN
network:
  version: 2
  ethernets:
    $IFACE:
      addresses:
        - ${STATIC_IP}/24
      routes:
        - to: default
          via: $(echo "$STATIC_IP" | sed 's/\.[0-9]*$/.1/')
      nameservers:
        addresses: [1.1.1.1, 8.8.8.8]
NETPLAN
	netplan apply
}

# ---------------------------------------------------------------------------
# 86Box
# ---------------------------------------------------------------------------
install_86box_binary() {
	log "Installiere 86Box (neuestes Release)..."
	local ARCH RELEASE_JSON TAG DOWNLOAD_URL FILENAME
	ARCH=$(uname -m)
	RELEASE_JSON=$(curl -sL "https://api.github.com/repos/86Box/86Box/releases/latest")
	TAG=$(echo "$RELEASE_JSON" | jq -r '.tag_name')
	DOWNLOAD_URL=$(echo "$RELEASE_JSON" | jq -r ".assets[] | select(.name | test(\"Linux.*x86_64\")) | .browser_download_url" | head -1)

	if [[ -z "$DOWNLOAD_URL" || "$DOWNLOAD_URL" == "null" ]]; then
		DOWNLOAD_URL=$(echo "$RELEASE_JSON" | jq -r ".assets[] | select(.name | endswith(\".AppImage\")) | .browser_download_url" | head -1)
	fi

	if [[ -z "$DOWNLOAD_URL" || "$DOWNLOAD_URL" == "null" ]]; then
		err "Kein passendes 86Box-Binary gefunden."
		return 1
	fi

	FILENAME=$(basename "$DOWNLOAD_URL")
	mkdir -p /opt/86box/bin
	rm -f /usr/local/bin/86Box
	wget -q -O "/opt/86box/bin/$FILENAME" "$DOWNLOAD_URL"

	if [[ "$FILENAME" == *.tar.gz ]]; then
		tar -xzf "/opt/86box/bin/$FILENAME" -C /opt/86box/bin/
		rm -f "/opt/86box/bin/$FILENAME"
	elif [[ "$FILENAME" == *.AppImage ]]; then
		chmod +x "/opt/86box/bin/$FILENAME"
		ln -sf "/opt/86box/bin/$FILENAME" /usr/local/bin/86Box
	fi

	if [[ -f /opt/86box/bin/86Box ]]; then
		chmod +x /opt/86box/bin/86Box
		ln -sf /opt/86box/bin/86Box /usr/local/bin/86Box
	fi

	[[ -x "$(command -v 86Box 2>/dev/null || true)" ]] || [[ -f /usr/local/bin/86Box ]]
}

link_rom_path() {
	log "Verknüpfe ROM-Pfad (ROM-Inhalt über Sphere86-Panel bereitstellen)..."
	mkdir -p "$CONFIG_PATH/roms"
	mkdir -p /opt/86box
	rm -rf /opt/86box/roms
	ln -sfn "$CONFIG_PATH/roms" /opt/86box/roms
	chown -R "$BOX_USER:$BOX_USER" "$CONFIG_PATH" 2>/dev/null || chown "$BOX_USER:$BOX_USER" "$CONFIG_PATH" 2>/dev/null || true
}

# ---------------------------------------------------------------------------
# Sunshine
# ---------------------------------------------------------------------------
install_sunshine_deb() {
	log "Installiere Sunshine-Paket..."
	local DISTRO SUNSHINE_DEB_URL DEB_FILE
	DISTRO=$(lsb_release -cs 2>/dev/null || echo "bookworm")
	SUNSHINE_DEB_URL=$(curl -sL "https://api.github.com/repos/LizardByte/Sunshine/releases/latest" | \
		jq -r ".assets[] | select(.name | test(\"sunshine.*${DISTRO}.*amd64.deb\")) | .browser_download_url" | head -1)

	if [[ -z "$SUNSHINE_DEB_URL" || "$SUNSHINE_DEB_URL" == "null" ]]; then
		SUNSHINE_DEB_URL=$(curl -sL "https://api.github.com/repos/LizardByte/Sunshine/releases/latest" | \
			jq -r '.assets[] | select(.name | endswith(".deb")) | .browser_download_url' | head -1)
	fi

	if [[ -z "$SUNSHINE_DEB_URL" || "$SUNSHINE_DEB_URL" == "null" ]]; then
		err "Sunshine-.deb nicht gefunden."
		return 1
	fi

	DEB_FILE="/tmp/sunshine-sphere86.deb"
	wget -q -O "$DEB_FILE" "$SUNSHINE_DEB_URL"
	apt-get install -y -qq "$DEB_FILE" 2>/dev/null || { dpkg -i "$DEB_FILE" && apt-get install -f -y -qq; }
	rm -f "$DEB_FILE"
	command -v sunshine >/dev/null 2>&1
}

configure_sunshine_files() {
	local SUNSHINE_CONFIG_DIR="/home/$BOX_USER/.config/sunshine"
	mkdir -p "$SUNSHINE_CONFIG_DIR"
	cat > "$SUNSHINE_CONFIG_DIR/sunshine.conf" <<SUNCONF
origin_web_ui_allowed = lan
upnp = off
port = 47989
SUNCONF
	chown -R "$BOX_USER:$BOX_USER" "$SUNSHINE_CONFIG_DIR"

	if command -v sunshine >/dev/null 2>&1; then
		sudo -u "$BOX_USER" sunshine --creds "$BOX_USER" "$SUNSHINE_PASS" >/dev/null 2>&1 || \
			warn "Sunshine-Zugangsdaten ggf. manuell: sudo -u $BOX_USER sunshine --creds $BOX_USER <pass>"
	fi
}

write_sunshine_systemd() {
	cat > "/etc/systemd/system/${SUNSHINE_UNIT}" <<SERVICE
[Unit]
Description=Sunshine (Sphere86)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$BOX_USER
Group=$BOX_USER
WorkingDirectory=/home/$BOX_USER
ExecStart=/usr/bin/sunshine
Restart=on-failure
RestartSec=3
Environment=HOME=/home/$BOX_USER

[Install]
WantedBy=multi-user.target
SERVICE
	systemctl daemon-reload
	systemctl enable "${SUNSHINE_UNIT}"
	systemctl restart "${SUNSHINE_UNIT}"
	sleep 2
}

# ---------------------------------------------------------------------------
# Share-Mount
# ---------------------------------------------------------------------------
setup_share_mount() {
	mkdir -p "$CONFIG_PATH"
	chown "$BOX_USER:$BOX_USER" "$CONFIG_PATH"
	sed -i "\|[[:space:]]$CONFIG_PATH[[:space:]]|d" /etc/fstab

	if [[ -z "$SHARE_ADDR" ]]; then
		return 0
	fi

	local EFFECTIVE_SHARE_TYPE SMB_SOURCE
	EFFECTIVE_SHARE_TYPE="$SHARE_TYPE"

	if [[ "$EFFECTIVE_SHARE_TYPE" == "smb" ]]; then
		SMB_SOURCE="$SHARE_ADDR"
		if [[ "$SMB_SOURCE" != //* && "$SMB_SOURCE" == *:* ]]; then
			SMB_SOURCE="//${SMB_SOURCE/:/\/}"
		fi
		if [[ "$SMB_SOURCE" != //* ]]; then
			err "SMB-Pfad muss //server/share[/pfad] sein. Erhalten: $SHARE_ADDR"
			return 1
		fi
		local CREDS_FILE="/etc/sphere86-smb-creds"
		if [[ -n "$SMB_USER" ]]; then
			cat > "$CREDS_FILE" <<CREDS
username=$SMB_USER
password=$SMB_PASS
CREDS
			[[ -n "$SMB_DOMAIN" ]] && echo "domain=$SMB_DOMAIN" >> "$CREDS_FILE"
			chmod 600 "$CREDS_FILE"
			echo "$SMB_SOURCE $CONFIG_PATH cifs credentials=$CREDS_FILE,uid=$BOX_USER,gid=$BOX_USER,dir_mode=0775,file_mode=0664,vers=3.0,nofail,_netdev 0 0" >> /etc/fstab
		else
			echo "$SMB_SOURCE $CONFIG_PATH cifs guest,uid=$BOX_USER,gid=$BOX_USER,dir_mode=0775,file_mode=0664,vers=3.0,nofail,_netdev 0 0" >> /etc/fstab
		fi
		mount -a || return 1
	else
		echo "$SHARE_ADDR $CONFIG_PATH nfs defaults,nofail,_netdev 0 0" >> /etc/fstab
		mount -a || return 1
	fi
}

# ---------------------------------------------------------------------------
# Firewall (UFW)
# ---------------------------------------------------------------------------
configure_firewall_hints() {
	if command -v ufw &>/dev/null; then
		ufw allow 47984/tcp 2>/dev/null || true
		ufw allow 47989/tcp 2>/dev/null || true
		ufw allow 47990/tcp 2>/dev/null || true
		ufw allow 47998:48010/udp 2>/dev/null || true
	fi
}

# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------
test_86box_installed() {
	local p
	p=$(command -v 86Box 2>/dev/null) || return 1
	[[ -n "$p" && -x "$p" ]]
}

test_sunshine_service() {
	systemctl is-active --quiet "${SUNSHINE_UNIT}"
}

test_sunshine_http() {
	# API oft 401 ohne Session – Verbindung zählt; HTTPS zuerst, dann HTTP
	local code
	code=$(curl -sk --connect-timeout 5 -o /dev/null -w "%{http_code}" "https://127.0.0.1:47990/api/config" 2>/dev/null || echo "000")
	[[ "$code" =~ ^(200|401|403)$ ]] && return 0
	code=$(curl -s --connect-timeout 5 -o /dev/null -w "%{http_code}" "http://127.0.0.1:47990/api/config" 2>/dev/null || echo "000")
	[[ "$code" =~ ^(200|401|403)$ ]]
}

test_config_dir() {
	[[ -d "$CONFIG_PATH" ]]
}

test_share_mounted() {
	[[ -z "$SHARE_ADDR" ]] && return 0
	findmnt "$CONFIG_PATH" &>/dev/null
}

test_static_ip_applied() {
	[[ -z "$STATIC_IP" ]] && return 0
	ip -br addr 2>/dev/null | grep -q "${STATIC_IP%%/*}" || ip addr | grep -q "${STATIC_IP%%/*}"
}

run_tests_for_mode() {
	local mode="$1"
	# Install-Schritte bleiben erhalten; Tests werden angehängt

	case "$mode" in
		full)
			test_86box_installed && wizard_add "[Test] 86Box-Binary vorhanden" 0 || wizard_add "[Test] 86Box-Binary vorhanden" 1
			test_config_dir && wizard_add "[Test] Konfigurationsverzeichnis $CONFIG_PATH" 0 || wizard_add "[Test] Konfigurationsverzeichnis" 1
			test_sunshine_service && wizard_add "[Test] Sunshine-Dienst aktiv (${SUNSHINE_UNIT})" 0 || wizard_add "[Test] Sunshine-Dienst aktiv" 1
			test_sunshine_http && wizard_add "[Test] Sunshine-Web-UI (Port 47990) erreichbar" 0 || wizard_add "[Test] Sunshine-Web-UI erreichbar" 1
			test_share_mounted && wizard_add "[Test] Share unter $CONFIG_PATH gemountet" 0 || wizard_add "[Test] Share gemountet" 1
			[[ -n "$STATIC_IP" ]] && {
				test_static_ip_applied && wizard_add "[Test] Statische IP $STATIC_IP" 0 || wizard_add "[Test] Statische IP" 1
			}
			;;
		86box)
			test_86box_installed && wizard_add "[Test] 86Box-Binary" 0 || wizard_add "[Test] 86Box-Binary" 1
			test_config_dir && wizard_add "[Test] Konfigurationsverzeichnis" 0 || wizard_add "[Test] Konfigurationsverzeichnis" 1
			;;
		sunshine)
			test_sunshine_service && wizard_add "[Test] Sunshine-Dienst aktiv + Autostart" 0 || wizard_add "[Test] Sunshine-Dienst" 1
			test_sunshine_http && wizard_add "[Test] Sunshine-Web-UI" 0 || wizard_add "[Test] Sunshine-Web-UI" 1
			;;
		smb)
			test_config_dir && wizard_add "[Test] Pfad $CONFIG_PATH" 0 || wizard_add "[Test] Konfigurationspfad" 1
			test_share_mounted && wizard_add "[Test] Share gemountet" 0 || wizard_add "[Test] Share gemountet" 1
			;;
		ip)
			test_static_ip_applied && wizard_add "[Test] IP-Adresse gesetzt" 0 || wizard_add "[Test] IP-Adresse" 1
			;;
	esac
	wizard_print_summary
}

# ---------------------------------------------------------------------------
# Abfragen
# ---------------------------------------------------------------------------
prompt_full_config() {
	echo ""
	log "Neuinstallation – Eingaben"
	read -rp "Hostname [streaming-host]: " HOSTNAME_INPUT
	HOSTNAME_INPUT="${HOSTNAME_INPUT:-streaming-host}"
	read -rp "Benutzer für 86Box/Sunshine [sphere86]: " BOX_USER
	BOX_USER="${BOX_USER:-sphere86}"
	read -rp "Passwort für $BOX_USER: " -s BOX_PASS
	echo ""
	BOX_PASS="${BOX_PASS:-sphere86}"
	read -rp "Statische IP (leer = DHCP): " STATIC_IP
	read -rp "Konfig-Mountpunkt [/opt/86box/configs]: " CONFIG_PATH
	CONFIG_PATH="${CONFIG_PATH:-/opt/86box/configs}"
	read -rp "NFS/SMB-Freigabe (leer = überspringen, z. B. 192.168.1.10:/share oder //server/share): " SHARE_ADDR
	SHARE_TYPE="smb"
	SMB_USER=""
	SMB_PASS=""
	SMB_DOMAIN=""
	if [[ -n "$SHARE_ADDR" ]]; then
		read -rp "Typ [nfs/smb, Standard smb]: " SHARE_TYPE
		SHARE_TYPE="${SHARE_TYPE:-smb}"
		while [[ "$SHARE_TYPE" != "nfs" && "$SHARE_TYPE" != "smb" ]]; do
			warn "Bitte nfs oder smb eingeben."
			read -rp "Typ [nfs/smb]: " SHARE_TYPE
			SHARE_TYPE="${SHARE_TYPE:-smb}"
		done
		if [[ "$SHARE_TYPE" == "smb" ]]; then
			read -rp "SMB-Benutzer (leer = Gast): " SMB_USER
			if [[ -n "$SMB_USER" ]]; then
				read -rp "SMB-Passwort: " -s SMB_PASS
				echo ""
				read -rp "SMB-Domäne (optional): " SMB_DOMAIN
			fi
		fi
	fi
	read -rp "Sunshine Web-UI Passwort [sunshine]: " SUNSHINE_PASS
	SUNSHINE_PASS="${SUNSHINE_PASS:-sunshine}"
	echo ""
}

prompt_minimal_user() {
	if ! load_install_conf; then
		read -rp "Benutzer für 86Box/Sunshine [sphere86]: " BOX_USER
		BOX_USER="${BOX_USER:-sphere86}"
	else
		log "Nutze install.conf: BOX_USER=$BOX_USER"
	fi
	read -rp "Passwort für Benutzer $BOX_USER (nur bei neuem User nötig): " -s BOX_PASS
	echo ""
	BOX_PASS="${BOX_PASS:-sphere86}"
	read -rp "Konfig-Pfad [/opt/86box/configs]: " CONFIG_PATH
	CONFIG_PATH="${CONFIG_PATH:-/opt/86box/configs}"
}

prompt_sunshine_only() {
	if load_install_conf; then
		log "Aus install.conf: BOX_USER=$BOX_USER"
	else
		read -rp "Benutzer für Sunshine [sphere86]: " BOX_USER
		BOX_USER="${BOX_USER:-sphere86}"
	fi
	read -rp "Sunshine Web-UI Passwort [sunshine]: " SUNSHINE_PASS
	SUNSHINE_PASS="${SUNSHINE_PASS:-sunshine}"
}

prompt_smb_only() {
	if load_install_conf; then
		log "Aktueller CONFIG_PATH=$CONFIG_PATH (Enter behält)"
	fi
	read -rp "Konfig-Mountpunkt [$CONFIG_PATH]: " _cp
	[[ -n "$_cp" ]] && CONFIG_PATH="$_cp"
	read -rp "NFS/SMB-Adresse (z. B. //server/share oder host:/path): " SHARE_ADDR
	[[ -z "$SHARE_ADDR" ]] && { err "Share-Adresse erforderlich."; return 1; }
	read -rp "Typ [nfs/smb, Standard smb]: " SHARE_TYPE
	SHARE_TYPE="${SHARE_TYPE:-smb}"
	while [[ "$SHARE_TYPE" != "nfs" && "$SHARE_TYPE" != "smb" ]]; do
		read -rp "Typ [nfs/smb]: " SHARE_TYPE
		SHARE_TYPE="${SHARE_TYPE:-smb}"
	done
	SMB_USER=""
	SMB_PASS=""
	SMB_DOMAIN=""
	if [[ "$SHARE_TYPE" == "smb" ]]; then
		read -rp "SMB-Benutzer (leer = Gast): " SMB_USER
		if [[ -n "$SMB_USER" ]]; then
			read -rp "SMB-Passwort: " -s SMB_PASS
			echo ""
			read -rp "SMB-Domäne (optional): " SMB_DOMAIN
		fi
	fi
}

prompt_ip_only() {
	read -rp "Statische IP (z. B. 192.168.1.50): " STATIC_IP
	[[ -n "$STATIC_IP" ]] || { err "Keine IP angegeben."; return 1; }
}

# ---------------------------------------------------------------------------
# Aktionen
# ---------------------------------------------------------------------------
do_full_install() {
	wizard_reset
	prompt_full_config
	read -rp "Fortfahren? [J/n] " CONFIRM
	[[ "${CONFIRM,,}" == "n" ]] && { log "Abgebrochen."; return 0; }

	local step_ok=0

	install_base_packages && wizard_add "System-Pakete & Updates" 0 || { wizard_add "System-Pakete & Updates" 1; step_ok=1; }
	[[ $step_ok -ne 0 ]] && { wizard_print_summary; return 1; }

	apply_hostname && wizard_add "Hostname setzen" 0 || wizard_add "Hostname" 1
	ensure_user && wizard_add "Benutzer $BOX_USER" 0 || wizard_add "Benutzer" 1

	if [[ -n "$STATIC_IP" ]]; then
		apply_static_ip && wizard_add "Statische IP $STATIC_IP" 0 || wizard_add "Statische IP" 1
	fi

	install_86box_binary && wizard_add "86Box installieren" 0 || wizard_add "86Box installieren" 1
	link_rom_path && wizard_add "ROM-Pfad verknüpft (Inhalt über Sphere86)" 0 || wizard_add "ROM-Pfad" 1

	install_sunshine_deb && wizard_add "Sunshine-Paket installieren" 0 || wizard_add "Sunshine-Paket" 1
	configure_sunshine_files && wizard_add "Sunshine-Konfiguration" 0 || wizard_add "Sunshine-Konfiguration" 1
	write_sunshine_systemd && wizard_add "Sunshine systemd: Start + Autostart" 0 || wizard_add "Sunshine systemd" 1

	setup_share_mount && wizard_add "Share einbinden" 0 || wizard_add "Share einbinden" 1
	link_rom_path && wizard_add "ROM-Pfad nach Share" 0 || true

	configure_firewall_hints && wizard_add "Firewall (UFW) Ports" 0 || wizard_add "Firewall" 1

	save_install_conf
	ok "install.conf gespeichert: $INSTALL_CONF"

	echo ""
	log "Hinweis: ROMs werden nicht heruntergeladen – bitte über das Sphere86-Panel verwalten."
	log "Sunshine-UI: https://$(hostname -I 2>/dev/null | awk '{print $1}'):47990"

	run_tests_for_mode full
}

do_86box_only() {
	wizard_reset
	prompt_minimal_user
	ensure_user || true
	install_86box_binary && wizard_add "86Box neu installiert" 0 || wizard_add "86Box neu installiert" 1
	link_rom_path && wizard_add "ROM-Pfad" 0 || wizard_add "ROM-Pfad" 1
	save_install_conf
	run_tests_for_mode 86box
}

do_sunshine_only() {
	wizard_reset
	prompt_sunshine_only
	ensure_user || true
	install_sunshine_deb && wizard_add "Sunshine-Paket" 0 || wizard_add "Sunshine-Paket" 1
	configure_sunshine_files && wizard_add "Sunshine-Dateien" 0 || wizard_add "Sunshine-Dateien" 1
	write_sunshine_systemd && wizard_add "Sunshine Dienst + Autostart" 0 || wizard_add "Sunshine Dienst" 1
	save_install_conf
	run_tests_for_mode sunshine
}

do_smb_only() {
	wizard_reset
	prompt_smb_only || return 1
	ensure_user || true
	setup_share_mount && wizard_add "SMB/NFS eingebunden" 0 || wizard_add "SMB/NFS" 1
	link_rom_path && wizard_add "ROM-Pfad" 0 || wizard_add "ROM-Pfad" 1
	save_install_conf
	run_tests_for_mode smb
}

do_set_ip() {
	wizard_reset
	prompt_ip_only || return 1
	apply_static_ip && wizard_add "Netplan / statische IP" 0 || wizard_add "Statische IP" 1
	save_install_conf
	run_tests_for_mode ip
}

show_menu() {
	echo ""
	echo -e "${COLOR_CYAN}=== Sphere86 Installations-Wizard ===${COLOR_NC}"
	echo "  1) Neuinstallation (komplett)"
	echo "  2) Nur 86Box installieren (bestehende Installation überschreiben)"
	echo "  3) Nur Sunshine installieren (bestehende Installation überschreiben)"
	echo "  4) Nur SMB/NFS-Share verbinden"
	echo "  5) Statische IP setzen"
	echo "  6) Beenden / Abbrechen"
	echo ""
}

main() {
	preflight_root
	log "Sphere86 Streaming-Host – Wizard"
	log "Ziel: Debian 12 / Ubuntu 22.04+"
	echo ""

	while true; do
		show_menu
		read -rp "Auswahl [1-6]: " choice
		case "${choice:-}" in
			1) do_full_install || true ;;
			2) do_86box_only || true ;;
			3) do_sunshine_only || true ;;
			4) do_smb_only || true ;;
			5) do_set_ip || true ;;
			6|q|Q)
				log "Beendet."
				exit 0
				;;
			"")
				warn "Bitte 1–6 wählen."
				;;
			*)
				warn "Ungültige Auswahl."
				;;
		esac
		read -rp "Enter für Menü..." _
	done
}

main "$@"
