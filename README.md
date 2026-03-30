# Sphere86 v2

A central orchestrator for retro PC emulation via **86Box** + **Sunshine/Moonlight** streaming.

Sphere86 lets you create and manage 86Box machine configurations from a modern web interface, deploy them to one or more streaming hosts, and register them as Sunshine applications — so each retro PC is accessible with ultra-low latency through any Moonlight client.

## Architecture

```
Browser  ──>  Sphere86 (SvelteKit, single Docker container)
                │
                ├── SQLite database (/data)
                ├── Writes 86box.cfg to shared mount (/share)
                └── Calls Sunshine REST API on streaming hosts
                       │
                       ▼
              Streaming Host (VM / Workstation)
                ├── 86Box (launched per Sunshine app)
                ├── Sunshine (streams to Moonlight)
                └── Shared config mount
```

## Features

- **86Box Config Generator** — form-based wizard for CPU, RAM, video, sound, storage, networking
- **Multi-host management** — add/test multiple Sunshine streaming servers
- **One-click Sunshine publishing** — registers 86Box configs as Moonlight-streamable apps
- **86Box & ROM updates** — checks GitHub releases, downloads and extracts automatically
- **Dark & Light mode** — premium design based on the "Digital Curator" design system
- **Authentication** — session-based with default password + forced change on first login
- **Audit log** — tracks who changed what and when
- **WebSocket progress** — real-time status for long-running operations
- **Single Docker container** — one image, one process, persistent SQLite volume
- **Streaming host provisioner** — one-click shell script for Debian/Ubuntu guests

## Quick Start

### Docker (recommended)

```bash
docker compose up -d
```

The compose file maps a **host data directory** to `/data` in the container. Adjust the path in `docker-compose.yml` if needed; by default it expects a sibling folder next to the repo, e.g. `…/GitHub/sphere86_data`.

Open `http://localhost:3000` — login with **admin / sphere86**.

### Local Development

```bash
npm install
npm run dev
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SPHERE86_SECRET` | `change-me-...` | Encryption key for stored credentials (min 32 chars) |
| `DATABASE_URL` | `file:./data/sphere86.db` | SQLite database path |
| `SHARE_ROOT` | _(empty)_ | Host mount point where configs are written |
| `PORT` | `3000` | HTTP port |

## Streaming Host Setup

Run the provisioning script on a fresh **Debian 12** or **Ubuntu 22.04+** VM:

```bash
sudo bash scripts/sphere86_install_wizard.sh
```

(`scripts/provision-streaming-host.sh` leitet nur noch auf den Wizard um.)

Der interaktive Wizard bietet u. a. **Neuinstallation**, **nur 86Box**, **nur Sunshine**, **nur Share**, **statische IP** sowie Tests und eine **Passed/Failed-Zusammenfassung**. ROMs werden **nicht** vom Skript geladen – Bereitstellung über das **Sphere86-Webpanel**.

### What the wizard can do

1. Installs X11, PulseAudio, and base tools (full install)
2. Creates a dedicated user for 86Box / Sunshine
3. Optionally sets a static IP (Netplan)
4. Downloads the latest 86Box binary from GitHub (ROM content via Sphere86 UI)
5. Installs Sunshine from LizardByte, enables and starts `sphere86-sunshine.service` (autostart)
6. Configures an NFS/SMB mount for shared configs
7. Opens firewall ports for Sunshine/Moonlight (UFW if present)

### Local / Workstation Setup

For running on your own workstation without Docker:

1. Install 86Box and Sunshine manually for your OS
2. Mount or symlink the config share directory
3. Run Sphere86 with `npm run dev` and point `SHARE_ROOT` to your local config folder

## Tech Stack

- **Frontend:** SvelteKit 5 + TypeScript
- **Styling:** Tailwind CSS v4, custom design tokens from DESIGN.md
- **Backend:** SvelteKit server routes (adapter-node)
- **Database:** SQLite via Drizzle ORM
- **Real-time:** WebSocket (production) / SSE (development fallback)
- **Auth:** Argon2 password hashing, session cookies
- **Container:** Node 22 slim, single-stage production image

## Project Structure

```
src/
├── routes/
│   ├── (auth)/login/          Login page
│   ├── (app)/
│   │   ├── dashboard/         Overview stats
│   │   ├── hosts/             Sunshine host CRUD
│   │   ├── machines/          86Box config generator
│   │   ├── jobs/              Background task monitor
│   │   └── settings/          Password, updates, system info
│   └── api/                   REST endpoints
├── lib/
│   ├── server/
│   │   ├── db/                Schema, migrations, Drizzle
│   │   ├── sunshine/          Sunshine REST client
│   │   ├── 86box/             Config generator, updater
│   │   ├── jobs/              Job manager with WS broadcast
│   │   └── crypto/            AES-256-GCM credential encryption
│   ├── stores/                Svelte stores (theme, jobs)
│   └── components/            Shared UI components
scripts/
    sphere86_install_wizard.sh
    provision-streaming-host.sh  # legacy alias → wizard
```

## Security

- Credentials encrypted at rest (AES-256-GCM)
- Login rate limiting (5 attempts / 15 min)
- Security headers (X-Frame-Options, CSP-adjacent, etc.)
- Session-based auth with HTTP-only cookies
- Audit log for all mutations

## License

MIT
