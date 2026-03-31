# Sphere86

A central orchestrator for retro PC emulation with **86Box** and **Sunshine / Moonlight** streaming.

Sphere86 provides a web interface to create and manage 86Box machine configurations, deploy them to one or more streaming hosts, and register them as Sunshine applications so each machine is reachable with low latency from any Moonlight client.

## Architecture

```
Browser  ──>  Sphere86 (SvelteKit, Docker)
                │
                ├── SQLite + app state under `/data/sphere86`
                ├── Sunshine config under `/data/sunshine`
                ├── 86Box VMs + ROMs under `/data/86box`
                └── Sunshine REST API
                     ├── External host mode (VM/workstation), or
                     └── Embedded single-image mode (same container)
```

## Features

- **86Box config generator** — form-based editor for CPU, RAM, video, sound, storage, networking
- **Multi-host management** — add and test multiple Sunshine servers
- **Sunshine publishing** — register 86Box configs as Moonlight-streamable apps
- **86Box and ROM updates** — checks GitHub releases, downloads and extracts where applicable
- **Dark and light themes** — design system inspired by “Digital Curator”
- **Authentication** — sessions with default password and forced change on first login
- **Audit log** — who changed what and when
- **WebSocket progress** — live status for long-running jobs
- **Single-image embedded host mode** — one privileged container can run Sphere86 + Sunshine + 86Box + virtual display
- **Single container image** — persistent data on a volume
- **Streaming host installer** — shell wizard for Debian / Ubuntu guests (`tools/scripts`)

## Quick start

### Docker (recommended)

Create a `.env` file next to `docker-compose.yml` and set a host path for persistent data:

```env
SPHERE86_DATA_DIR=/path/on/host/sphere86-data
SPHERE86_SECRET=replace-with-a-long-random-secret-at-least-32-chars
```

Then:

```bash
docker compose up -d
```

The compose file maps `${SPHERE86_DATA_DIR}` to `/data` in the container.  
Inside that path, Sphere86 uses:

- `/data/sphere86` app database/logs/cache
- `/data/sunshine` Sunshine config and credentials
- `/data/86box` VM configs and ROM storage

`docker-compose.yml` uses `network_mode: bridge` for the single service, so no extra project-scoped compose network is created.

Open `http://localhost:3000` and sign in with **admin** / **sphere86** (change the password when prompted).

### Docker single-image embedded host mode

This repository now supports running the full stack in one container:

- Sphere86 app
- Sunshine
- 86Box
- Xorg (dummy driver) + lightweight X session (Openbox, software rendering)

`docker-compose.yml` is preconfigured for this mode (`privileged: true` and Sunshine ports exposed).  
The container bootstrap creates/updates an **embedded managed host** in Sphere86 automatically.
Internally it targets `127.0.0.1:47990` for API calls, while the web link shown in Sphere86 can use your request host/IP.

Important:

- This mode requires a **privileged container**.
- Target platform is **x86_64 / amd64 Linux** (Sunshine + 86Box release assets used by bootstrap are amd64-focused).
- Keep `SPHERE86_SECRET` stable (or stored host credentials become unreadable).
- Default Sunshine login is `admin` / `sunshine` (override via env).

Example `.env`:

```env
SPHERE86_DATA_DIR=/path/on/host/sphere86-data
SPHERE86_SECRET=replace-with-a-long-random-secret-at-least-32-chars
SUNSHINE_WEB_USERNAME=admin
SUNSHINE_WEB_PASSWORD=change-this-password
BOX_USER=sphere86
```

After startup:

1. Open `http://localhost:3000`
2. Go to **Hosts** and verify the **Embedded** host is online
3. Go to **Settings** -> **Embedded Sunshine Host** to control core Sunshine options
4. Create/publish a machine profile and connect via Moonlight

### Local development

```bash
npm install
npm run dev
```

### Environment variables

| Variable | Typical value | Description |
|----------|----------------|-------------|
| `SPHERE86_SECRET` | 32+ random characters | Encrypts stored Sunshine and related credentials |
| `DATABASE_URL` | `file:/data/sphere86/config/sphere86.db` (Docker) or `file:./data/sphere86/config/sphere86.db` (dev) | SQLite database file |
| `SPHERE86_DATA_ROOT` | `/data/sphere86` | Sphere86 app runtime root for DB/logs/cache |
| `BOX86_CONFIG_BASE_PATH` | `/data/86box` | Base path where `vms/<uuid>/86box.cfg` is written |
| `BOX86_BINARY_PATH` | `/usr/local/bin/86Box` | 86Box binary used when publishing to Sunshine |
| `BOX86_ROMS_PATH` | `/opt/86box/roms` | Standard ROM directory passed to 86Box (`-R`) |
| `PORT` | `3000` | HTTP port |

In Docker, `DATABASE_URL` and `SPHERE86_DATA_ROOT` are set in `docker-compose.yml` / the image so the database and file tree stay under the `/data` volume.

Additional embedded-mode variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `SPHERE86_SINGLE_IMAGE_MODE` | `true` | Enables single-image behavior and embedded host registration |
| `SPHERE86_EMBEDDED_HOST` | `true` | Enables managed local streaming host bootstrap |
| `SPHERE86_EMBEDDED_HOST_NAME` | `Embedded Local Host` | Name shown in the Hosts page |
| `SPHERE86_SUNSHINE_NAME` | `Embedded Local Host` | Sunshine host name advertised to Moonlight (`sunshine_name`) |
| `SPHERE86_CONTAINER_HOSTNAME` | `sphere86` | Container hostname (compose `hostname`) used as OS-level host identity |
| `SPHERE86_EMBEDDED_HOST_ADDRESS` | `127.0.0.1` | Local Sunshine API endpoint inside container |
| `SPHERE86_EMBEDDED_HOST_PUBLIC_ADDRESS` | empty | Optional public/UI address override shown for embedded host links |
| `SPHERE86_EMBEDDED_HOST_PORT` | `47990` | Sunshine API / Web UI port |
| `SPHERE86_EMBEDDED_SUNSHINE_SCHEME` | `auto` | `http`, `https`, or `auto` |
| `SUNSHINE_CONFIG_BASE_PATH` | `/data/sunshine` | Persistent Sunshine config root |
| `SUNSHINE_STREAM_PORT` | `47989` | Moonlight streaming/discovery port base written into Sunshine config |
| `SPHERE86_FORCE_XTEST_INPUT` | `false` | Blocks `/dev/uinput`/`/dev/uhid` so Sunshine uses XTest. Leave `false` (Xorg default). Set `true` only for legacy Xvfb mode. |
| `SPHERE86_USE_XORG` | `auto` | Display server: `auto` (Xorg when available), `true` (force Xorg), `false` (force Xvfb). Xorg + uinput is required for Sunshine input. |
| `SUNSHINE_WEB_USERNAME` | `admin` | Initial Sunshine Web UI user |
| `SUNSHINE_WEB_PASSWORD` | `sunshine` | Initial Sunshine Web UI password |
| `SUNSHINE_FORCE_INIT_CREDS` | `false` | If `true`, re-runs `sunshine --creds` on startup (normally skipped to preserve pairing state) |
| `SUNSHINE_INSTALL_METHOD` | `auto` | `auto` tries `.deb` first then AppImage fallback; `deb` or `appimage` force method |
| `SUNSHINE_DEB_URL` | empty | Optional explicit Sunshine `.deb` URL |
| `SUNSHINE_APPIMAGE_URL` | empty | Optional explicit Sunshine AppImage URL |
| `GITHUB_TOKEN` / `GITHUB_API_TOKEN` | empty | Optional temporary GitHub token for higher API rate limits during bootstrap |
| `BOX_USER` | `sphere86` | Linux user running Sunshine/86Box/X session |

Embedded mode ports:

- `3000/tcp` Sphere86 web UI/API
- `47990/tcp` Sunshine API/Web UI (HTTPS)
- `47984/tcp+udp`, `47989/tcp+udp`, `48010/tcp`, `47998-48010/udp` Moonlight streaming/discovery

Persistent path layout (single-image mode):

- `/data/sphere86` -> Sphere86 DB/logs/cache
- `/data/sunshine` -> Sunshine config/credentials
- `/data/86box` -> VMs (`vms/<uuid>`) and ROMs (`roms`)

Moonlight pairing persistence notes:

- Keep `/data/sunshine` on a persistent host volume.
- Bootstrap applies `SUNSHINE_WEB_USERNAME` / `SUNSHINE_WEB_PASSWORD` only on first initialization.
- Re-running credentials explicitly (`SUNSHINE_FORCE_INIT_CREDS=true`) can require re-pairing Moonlight clients.

Input in embedded mode:

The container uses **Xorg with the dummy video driver** instead of Xvfb.
Xorg reads kernel input events via libinput, so Sunshine's virtual devices (created through `/dev/uinput`) work natively for mouse, keyboard, and gamepad passthrough.

- `/dev/uinput` and `/dev/uhid` are set to mode `666` at startup so the unprivileged container user can create virtual input devices.
- `udevd` runs inside the container to handle hotplug of virtual input devices created by Sunshine during a streaming session.
- `SPHERE86_USE_XORG=auto` (default) automatically selects Xorg when the dummy driver is available; set to `false` to force legacy Xvfb mode.
- `SPHERE86_FORCE_XTEST_INPUT=false` (default) keeps uinput open. Set to `true` only for legacy Xvfb mode where XTest fallback is needed.
- `libxtst6` and `xdotool` remain installed for diagnostics (`DISPLAY=:0 xdotool key a`).

## Streaming host setup

On a fresh **Debian 12** or **Ubuntu 22.04+** machine, download and run the wizard (replace `OWNER` with your GitHub user or organization — same idea as in the Unraid section below):

```bash
wget -O sphere86-install-wizard.sh "https://raw.githubusercontent.com/OWNER/sphere86/main/tools/scripts/sphere86-install-wizard.sh"
chmod +x sphere86-install-wizard.sh
sudo ./sphere86-install-wizard.sh
```

**If you already have the repository cloned** on the host:

```bash
chmod +x tools/scripts/sphere86-install-wizard.sh
sudo ./tools/scripts/sphere86-install-wizard.sh
```

The wizard supports a full install, 86Box-only, Sunshine-only, and static IP options, with post-steps tests and a **Passed / Failed** summary. It does **not** download ROM sets; provide ROMs through the Sphere86 UI.

### What the wizard installs (full run)

1. Base desktop stack (X11, Xfce, LightDM, audio) and tools  
2. Dedicated Linux user for 86Box / Sunshine  
3. **LightDM auto-login** for that user so an X11 session exists at boot (fixes “no monitor” in Moonlight until someone logs in via noVNC)  
4. **systemd-logind linger** for that user (optional; helps user runtime directories)  
5. Optional static IP via Netplan  
6. Latest 86Box Linux build from GitHub (ROM content is separate; ROM directory is linked under your config path)  
7. Sunshine from LizardByte packages — `sphere86-sunshine.service` waits for the X11 socket, sets `DISPLAY` (default `:0`; set during install if your session uses e.g. `:2.0`), `XAUTHORITY`, and `XDG_RUNTIME_DIR` so streaming and launched apps see the same desktop  
8. Local config/runtime path only (no NFS/SMB required in single-image mode)  
9. Optional UFW rules for Sunshine / Moonlight ports  

### Moonlight / 86Box notes

- **ROM path:** Sphere86 publishes Sunshine commands with **`-R`** pointing at `<host config base>/roms` (the same folder the wizard links to `/opt/86box/roms`). Keep ROM files there or re-point the host in the Sphere86 UI.  
- **GUI / input:** 86Box is launched with the host’s **X11 DISPLAY** (match `echo $DISPLAY` on the streaming host; set in Sphere86 per Sunshine host if not `:0`) and **`QT_QPA_PLATFORM=xcb`** so it runs on the X session Sunshine captures. If you still see only a static desktop, **re-publish** the machine from Sphere86 so the updated command is sent to Sunshine.  
- **Fullscreen:** Per streaming host you can enable **Start 86Box fullscreen (-F)**; use **Re-publish** on the machine so Sunshine stores the new command (editing the VM config alone does not change Sunshine).  
- **Auto-login:** Required for Moonlight when no one is at the physical console; the wizard configures LightDM accordingly. Re-run the wizard’s **Sunshine-only** or **full** path if you change the streaming user name.

### Workstation without Docker

1. Install 86Box and Sunshine for your OS  
2. Mount or sync the same config directory you use from Sphere86  
3. Run `npm run dev` and set `SPHERE86_DATA_ROOT` to that directory

## Unraid

A Community Applications–style template is provided under `tools/unraid/sphere86.xml`.

- Replace the `OWNER` placeholder in **Repository**, **Support**, **Project**, and **TemplateURL** with your GitHub user or organization, or edit the image name to match your registry.  
- See `tools/unraid/README.md` for how to add the template and which variables map to Docker / compose.

## Tech stack

- **Frontend:** SvelteKit 5, TypeScript  
- **Styling:** Tailwind CSS v4, design tokens in `DESIGN.md`  
- **Backend:** SvelteKit server routes (adapter-node)  
- **Database:** SQLite with Drizzle ORM  
- **Real-time:** WebSockets in production, SSE fallback in development  
- **Auth:** Argon2 password hashing, HTTP-only session cookies  
- **Container:** Node 22 slim, single-stage production image  

## Repository layout

```
src/
├── routes/
│   ├── (auth)/login/
│   └── (app)/          dashboard, hosts, machines, jobs, settings
├── lib/
│   ├── server/         DB, Sunshine client, 86Box config, jobs, crypto
│   └── components/
tools/
├── scripts/
│   ├── sphere86-install-wizard.sh
│   └── parse_86box.py
└── unraid/
    ├── sphere86.xml
    └── README.md
```

At runtime inside the image, `tools/scripts` is copied to `/app/scripts` so paths like `scripts/parse_86box.py` keep working.

## Security

- Credentials encrypted at rest (AES-256-GCM)  
- Login rate limiting  
- Security-oriented HTTP headers  
- Session cookies HTTP-only  
- Audit log for mutating actions  

## License

MIT
