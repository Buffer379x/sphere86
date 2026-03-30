# Sphere86 v2

A central orchestrator for retro PC emulation with **86Box** and **Sunshine / Moonlight** streaming.

Sphere86 provides a web interface to create and manage 86Box machine configurations, deploy them to one or more streaming hosts, and register them as Sunshine applications so each machine is reachable with low latency from any Moonlight client.

## Architecture

```
Browser  ──>  Sphere86 (SvelteKit, single Docker container)
                │
                ├── SQLite database (under `/data` in Docker)
                ├── Writes configs and VM files under `SHARE_ROOT` (default `/data`)
                └── Calls the Sunshine REST API on streaming hosts
                       │
                       ▼
              Streaming host (VM or workstation)
                ├── 86Box (started per Sunshine app)
                ├── Sunshine (streams to Moonlight)
                └── Shared config directory (NFS/SMB or local)
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
- **Single container image** — one Node process; persistent data on a volume
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

The compose file maps `${SPHERE86_DATA_DIR}` to `/data` in the container. If `SPHERE86_DATA_DIR` is unset, the default placeholder path in `docker-compose.yml` must be replaced before the stack will start.

Open `http://localhost:3000` and sign in with **admin** / **sphere86** (change the password when prompted).

### Local development

```bash
npm install
npm run dev
```

### Environment variables

| Variable | Typical value | Description |
|----------|----------------|-------------|
| `SPHERE86_SECRET` | 32+ random characters | Encrypts stored Sunshine and related credentials |
| `DATABASE_URL` | `file:/data/config/sphere86.db` (Docker) or `file:./data/config/sphere86.db` (dev) | SQLite database file |
| `SHARE_ROOT` | `/data` (Docker) or empty / local path | Root directory for generated configs, VMs, ROM cache |
| `PORT` | `3000` | HTTP port |

In Docker, `DATABASE_URL` and `SHARE_ROOT` are set in `docker-compose.yml` / the image so the database and file tree stay under the `/data` volume.

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

The wizard supports a full install, 86Box-only, Sunshine-only, share-only, and static IP options, with post-steps tests and a **Passed / Failed** summary. It does **not** download ROM sets; provide ROMs through the Sphere86 UI or your share.

### What the wizard installs (full run)

1. Base desktop stack (X11, Xfce, LightDM, audio) and tools  
2. Dedicated Linux user for 86Box / Sunshine  
3. **LightDM auto-login** for that user so an X11 session exists at boot (fixes “no monitor” in Moonlight until someone logs in via noVNC)  
4. **systemd-logind linger** for that user (optional; helps user runtime directories)  
5. Optional static IP via Netplan  
6. Latest 86Box Linux build from GitHub (ROM content is separate; ROM directory is linked under your config path)  
7. Sunshine from LizardByte packages — `sphere86-sunshine.service` waits for the X11 socket, sets `DISPLAY` (default `:0`; set during install if your session uses e.g. `:2.0`), `XAUTHORITY`, and `XDG_RUNTIME_DIR` so streaming and launched apps see the same desktop  
8. Optional NFS or SMB mount for shared configs  
9. Optional UFW rules for Sunshine / Moonlight ports  

### Moonlight / 86Box notes

- **ROM path:** Sphere86 publishes Sunshine commands with **`-R`** pointing at `<host config base>/roms` (the same folder the wizard links to `/opt/86box/roms`). Keep ROM files there or re-point the host in the Sphere86 UI.  
- **GUI / input:** 86Box is launched with the host’s **X11 DISPLAY** (match `echo $DISPLAY` on the streaming host; set in Sphere86 per Sunshine host if not `:0`) and **`QT_QPA_PLATFORM=xcb`** so it runs on the X session Sunshine captures. If you still see only a static desktop, **re-publish** the machine from Sphere86 so the updated command is sent to Sunshine.  
- **Auto-login:** Required for Moonlight when no one is at the physical console; the wizard configures LightDM accordingly. Re-run the wizard’s **Sunshine-only** or **full** path if you change the streaming user name.

### Workstation without Docker

1. Install 86Box and Sunshine for your OS  
2. Mount or sync the same config directory you use from Sphere86  
3. Run `npm run dev` and set `SHARE_ROOT` to that directory  

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
