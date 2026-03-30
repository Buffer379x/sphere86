#!/usr/bin/env bash
set -euo pipefail

#
# Sphere86 – Streaming Host Provisioning Script
#
# Reference implementation for Debian 12 / Ubuntu 22.04+ guests.
# Installs: 86Box, Sunshine, and configures the system for Moonlight streaming.
#
# Usage:
#   curl -sSL https://raw.githubusercontent.com/<your-repo>/scripts/provision-streaming-host.sh | bash
#   or: bash provision-streaming-host.sh
#

COLOR_CYAN='\033[0;36m'
COLOR_GREEN='\033[0;32m'
COLOR_YELLOW='\033[1;33m'
COLOR_RED='\033[0;31m'
COLOR_NC='\033[0m'

log()  { echo -e "${COLOR_CYAN}[Sphere86]${COLOR_NC} $*"; }
ok()   { echo -e "${COLOR_GREEN}[  OK  ]${COLOR_NC} $*"; }
warn() { echo -e "${COLOR_YELLOW}[ WARN ]${COLOR_NC} $*"; }
err()  { echo -e "${COLOR_RED}[ERROR ]${COLOR_NC} $*"; }

export DEBIAN_FRONTEND=noninteractive

# ---------------------------------------------------------------------------
# 1. Pre-flight checks
# ---------------------------------------------------------------------------

if [[ $EUID -ne 0 ]]; then
    err "This script must be run as root (or with sudo)."
    exit 1
fi

log "Sphere86 Streaming Host Provisioner"
log "Target OS: Debian 12 / Ubuntu 22.04+"
echo ""

# ---------------------------------------------------------------------------
# 2. Gather configuration
# ---------------------------------------------------------------------------

read -rp "Hostname for this streaming VM [streaming-host]: " HOSTNAME_INPUT
HOSTNAME_INPUT="${HOSTNAME_INPUT:-streaming-host}"

read -rp "Create a user for 86Box? Username [sphere86]: " BOX_USER
BOX_USER="${BOX_USER:-sphere86}"

read -rp "Password for $BOX_USER: " -s BOX_PASS
echo ""
BOX_PASS="${BOX_PASS:-sphere86}"

read -rp "Static IP (leave blank for DHCP): " STATIC_IP

read -rp "Config share mount point [/opt/86box/configs]: " CONFIG_PATH
CONFIG_PATH="${CONFIG_PATH:-/opt/86box/configs}"

read -rp "NFS/SMB share address (e.g. 192.168.1.10:/mnt/user/86box, leave blank to skip): " SHARE_ADDR
SHARE_TYPE="none"
SMB_USER=""
SMB_PASS=""
SMB_DOMAIN=""
if [[ -n "$SHARE_ADDR" ]]; then
    SHARE_TYPE_DEFAULT="smb"
    read -rp "Share type [nfs/smb, default ${SHARE_TYPE_DEFAULT}]: " SHARE_TYPE
    SHARE_TYPE="${SHARE_TYPE:-$SHARE_TYPE_DEFAULT}"
    while [[ "$SHARE_TYPE" != "nfs" && "$SHARE_TYPE" != "smb" ]]; do
        warn "Please enter exactly: nfs or smb"
        read -rp "Share type [nfs/smb, default ${SHARE_TYPE_DEFAULT}]: " SHARE_TYPE
        SHARE_TYPE="${SHARE_TYPE:-$SHARE_TYPE_DEFAULT}"
    done
    if [[ "$SHARE_TYPE" == "smb" ]]; then
        read -rp "SMB username (leave blank for guest): " SMB_USER
        if [[ -n "$SMB_USER" ]]; then
            read -rp "SMB password for $SMB_USER: " -s SMB_PASS
            echo ""
            read -rp "SMB domain/workgroup (optional): " SMB_DOMAIN
        fi
    fi
fi

read -rp "Sunshine Web UI password [sunshine]: " SUNSHINE_PASS
SUNSHINE_PASS="${SUNSHINE_PASS:-sunshine}"

echo ""
log "Configuration summary:"
log "  Hostname:     $HOSTNAME_INPUT"
log "  User:         $BOX_USER"
log "  Config path:  $CONFIG_PATH"
log "  Share:        ${SHARE_ADDR:-none}"
log "  Share type:   ${SHARE_TYPE}"
echo ""
read -rp "Continue? [Y/n] " CONFIRM
[[ "${CONFIRM,,}" == "n" ]] && exit 0

# ---------------------------------------------------------------------------
# 3. System update + base packages
# ---------------------------------------------------------------------------

log "Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq
# Avoid interactive display-manager selection prompt.
echo "lightdm shared/default-x-display-manager select lightdm" | debconf-set-selections
echo "lightdm lightdm/default-display-manager select lightdm" | debconf-set-selections
apt-get install -y -qq \
    curl wget gnupg2 software-properties-common \
    xorg xfce4 lightdm dbus-x11 \
    pulseaudio \
    nfs-common cifs-utils \
    unzip tar jq

ok "Base packages installed."

# ---------------------------------------------------------------------------
# 4. Set hostname
# ---------------------------------------------------------------------------

hostnamectl set-hostname "$HOSTNAME_INPUT"
ok "Hostname set to $HOSTNAME_INPUT"

# ---------------------------------------------------------------------------
# 5. Create user
# ---------------------------------------------------------------------------

if ! id "$BOX_USER" &>/dev/null; then
    useradd -m -s /bin/bash -G audio,video,input,render "$BOX_USER"
    echo "$BOX_USER:$BOX_PASS" | chpasswd
    ok "User $BOX_USER created."
else
    warn "User $BOX_USER already exists."
fi

# ---------------------------------------------------------------------------
# 6. Static IP (optional, Netplan-based)
# ---------------------------------------------------------------------------

if [[ -n "$STATIC_IP" ]]; then
    IFACE=$(ip -br link | grep -v 'lo' | head -1 | awk '{print $1}')
    if command -v netplan &>/dev/null; then
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
        ok "Static IP $STATIC_IP configured on $IFACE."
    else
        warn "Netplan not found. Please configure static IP manually."
    fi
fi

# ---------------------------------------------------------------------------
# 7. Install 86Box
# ---------------------------------------------------------------------------

log "Installing 86Box..."

ARCH=$(uname -m)
RELEASE_JSON=$(curl -sL "https://api.github.com/repos/86Box/86Box/releases/latest")
TAG=$(echo "$RELEASE_JSON" | jq -r '.tag_name')

# Look for Linux x86_64 static/AppImage build
DOWNLOAD_URL=$(echo "$RELEASE_JSON" | jq -r ".assets[] | select(.name | test(\"Linux.*x86_64\")) | .browser_download_url" | head -1)

if [[ -z "$DOWNLOAD_URL" || "$DOWNLOAD_URL" == "null" ]]; then
    # Fallback: try AppImage
    DOWNLOAD_URL=$(echo "$RELEASE_JSON" | jq -r ".assets[] | select(.name | endswith(\".AppImage\")) | .browser_download_url" | head -1)
fi

if [[ -n "$DOWNLOAD_URL" && "$DOWNLOAD_URL" != "null" ]]; then
    FILENAME=$(basename "$DOWNLOAD_URL")
    mkdir -p /opt/86box/bin
    wget -q -O "/opt/86box/bin/$FILENAME" "$DOWNLOAD_URL"

    if [[ "$FILENAME" == *.tar.gz ]]; then
        tar -xzf "/opt/86box/bin/$FILENAME" -C /opt/86box/bin/
        rm "/opt/86box/bin/$FILENAME"
    elif [[ "$FILENAME" == *.AppImage ]]; then
        chmod +x "/opt/86box/bin/$FILENAME"
        ln -sf "/opt/86box/bin/$FILENAME" /usr/local/bin/86Box
    fi

    # Find the actual binary
    if [[ -f /opt/86box/bin/86Box ]]; then
        chmod +x /opt/86box/bin/86Box
        ln -sf /opt/86box/bin/86Box /usr/local/bin/86Box
    fi

    ok "86Box $TAG installed."
else
    warn "Could not find a suitable 86Box binary. Install manually."
fi

# ---------------------------------------------------------------------------
# 8. Configure ROM path (managed by Sphere86 data share)
# ---------------------------------------------------------------------------

log "Configuring 86Box ROM path..."
mkdir -p /opt/86box
mkdir -p "$CONFIG_PATH/roms"
rm -rf /opt/86box/roms
ln -s "$CONFIG_PATH/roms" /opt/86box/roms
ok "86Box ROM path linked to $CONFIG_PATH/roms"

# ---------------------------------------------------------------------------
# 9. Install Sunshine
# ---------------------------------------------------------------------------

log "Installing Sunshine..."

# Add LizardByte repo (Debian/Ubuntu)
DISTRO=$(lsb_release -cs 2>/dev/null || echo "bookworm")
SUNSHINE_DEB_URL=$(curl -sL "https://api.github.com/repos/LizardByte/Sunshine/releases/latest" | \
    jq -r ".assets[] | select(.name | test(\"sunshine.*${DISTRO}.*amd64.deb\")) | .browser_download_url" | head -1)

if [[ -z "$SUNSHINE_DEB_URL" || "$SUNSHINE_DEB_URL" == "null" ]]; then
    # Fallback to generic deb
    SUNSHINE_DEB_URL=$(curl -sL "https://api.github.com/repos/LizardByte/Sunshine/releases/latest" | \
        jq -r '.assets[] | select(.name | endswith(".deb")) | .browser_download_url' | head -1)
fi

if [[ -n "$SUNSHINE_DEB_URL" && "$SUNSHINE_DEB_URL" != "null" ]]; then
    DEB_FILE="/tmp/sunshine.deb"
    wget -q -O "$DEB_FILE" "$SUNSHINE_DEB_URL"
    apt-get install -y -qq "$DEB_FILE" || dpkg -i "$DEB_FILE" && apt-get install -f -y -qq
    rm -f "$DEB_FILE"
    ok "Sunshine installed."
else
    warn "Could not auto-install Sunshine. Visit https://docs.lizardbyte.dev/projects/sunshine/"
fi

# ---------------------------------------------------------------------------
# 10. Configure Sunshine
# ---------------------------------------------------------------------------

log "Configuring Sunshine..."

SUNSHINE_CONFIG_DIR="/home/$BOX_USER/.config/sunshine"
mkdir -p "$SUNSHINE_CONFIG_DIR"

cat > "$SUNSHINE_CONFIG_DIR/sunshine.conf" <<SUNCONF
origin_web_ui_allowed = lan
upnp = off
port = 47989
SUNCONF

chown -R "$BOX_USER:$BOX_USER" "$SUNSHINE_CONFIG_DIR"

# Set Sunshine Web UI credentials now
if command -v sunshine >/dev/null 2>&1; then
    sudo -u "$BOX_USER" sunshine --creds "$BOX_USER" "$SUNSHINE_PASS" >/dev/null 2>&1 || \
        warn "Could not set Sunshine credentials automatically. Run manually: sudo -u $BOX_USER sunshine --creds $BOX_USER <password>"
fi

# Use a system service (more reliable than --user service in headless/SSH sessions)
cat > /etc/systemd/system/sphere86-sunshine.service <<SERVICE
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
systemctl enable --now sphere86-sunshine.service >/dev/null 2>&1 || \
    warn "Could not auto-start sphere86-sunshine.service. Start manually: systemctl start sphere86-sunshine.service"

ok "Sunshine configured. Web UI at https://<this-ip>:47990"
ok "Sunshine credentials set for user: $BOX_USER"

# ---------------------------------------------------------------------------
# 11. Mount share (optional)
# ---------------------------------------------------------------------------

mkdir -p "$CONFIG_PATH"
chown "$BOX_USER:$BOX_USER" "$CONFIG_PATH"
# Avoid duplicate fstab entries when rerunning the script.
sed -i "\|[[:space:]]$CONFIG_PATH[[:space:]]|d" /etc/fstab

if [[ -n "$SHARE_ADDR" ]]; then
    EFFECTIVE_SHARE_TYPE="$SHARE_TYPE"

    if [[ "$EFFECTIVE_SHARE_TYPE" == "smb" ]]; then
        SMB_SOURCE="$SHARE_ADDR"
        # Allow host:/share/path input style and convert to //host/share/path
        if [[ "$SMB_SOURCE" != //* && "$SMB_SOURCE" == *:* ]]; then
            SMB_SOURCE="//${SMB_SOURCE/:/\/}"
        fi
        if [[ "$SMB_SOURCE" != //* ]]; then
            warn "SMB path must look like //server/share[/subpath]. Got: $SHARE_ADDR"
        else
            CREDS_FILE="/etc/sphere86-smb-creds"
            if [[ -n "$SMB_USER" ]]; then
                cat > "$CREDS_FILE" <<CREDS
username=$SMB_USER
password=$SMB_PASS
CREDS
                if [[ -n "$SMB_DOMAIN" ]]; then
                    echo "domain=$SMB_DOMAIN" >> "$CREDS_FILE"
                fi
                chmod 600 "$CREDS_FILE"
                echo "$SMB_SOURCE $CONFIG_PATH cifs credentials=$CREDS_FILE,uid=$BOX_USER,gid=$BOX_USER,dir_mode=0775,file_mode=0664,vers=3.0,nofail,_netdev 0 0" >> /etc/fstab
            else
                echo "$SMB_SOURCE $CONFIG_PATH cifs guest,uid=$BOX_USER,gid=$BOX_USER,dir_mode=0775,file_mode=0664,vers=3.0,nofail,_netdev 0 0" >> /etc/fstab
            fi
            mount -a 2>/dev/null || warn "SMB mount failed. Check server path and credentials for $SMB_SOURCE"
        fi
    else
        # NFS
        echo "$SHARE_ADDR $CONFIG_PATH nfs defaults,nofail,_netdev 0 0" >> /etc/fstab
        mount -a 2>/dev/null || warn "NFS mount failed. Check connectivity to ${SHARE_ADDR%%:*}"
    fi
    ok "Share configured at $CONFIG_PATH"
fi

# Re-check ROM path after mount/share setup.
mkdir -p "$CONFIG_PATH/roms"
rm -rf /opt/86box/roms
ln -s "$CONFIG_PATH/roms" /opt/86box/roms
ok "86Box ROM path linked to mounted share: $CONFIG_PATH/roms"

# ---------------------------------------------------------------------------
# 12. Firewall hints
# ---------------------------------------------------------------------------

log "Firewall configuration hints:"
echo "  Sunshine HTTPS UI:    TCP 47990"
echo "  Sunshine streaming:   TCP 47984, 47989"
echo "  Moonlight (UDP):      UDP 47998, 47999, 48000, 48002, 48010"
echo ""

if command -v ufw &>/dev/null; then
    ufw allow 47984/tcp
    ufw allow 47989/tcp
    ufw allow 47990/tcp
    ufw allow 47998:48010/udp
    ok "UFW rules added."
fi

# ---------------------------------------------------------------------------
# 13. Summary
# ---------------------------------------------------------------------------

echo ""
log "======================================"
log "  Provisioning complete!"
log "======================================"
echo ""
log "86Box binary:   $(which 86Box 2>/dev/null || echo '/opt/86box/bin/86Box')"
log "86Box ROMs:     /opt/86box/roms/"
log "Config path:    $CONFIG_PATH"
log "Sunshine UI:    https://$(hostname -I | awk '{print $1}'):47990"
echo ""
log "Next steps:"
log "  1. Verify Sunshine service:   systemctl status sphere86-sunshine.service"
log "  2. Start Sunshine (if needed): systemctl start sphere86-sunshine.service"
log "  3. In Sphere86 web UI, add this host:"
log "     - Address: $(hostname -I | awk '{print $1}')"
log "     - Port: 47990"
log "     - Config path: $CONFIG_PATH"
echo ""
log "  For Moonlight clients, pair with this machine's IP."
echo ""
