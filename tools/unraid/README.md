# Unraid Docker template

This folder contains `sphere86.xml`, a template compatible with Unraid’s **Community Applications** (CA) “add from URL” flow.

## Before you use it

1. **Replace placeholders**  
   Open `sphere86.xml` and replace every `OWNER` with your GitHub username or organization (the same segment used in your container image path, e.g. `ghcr.io/myorg/sphere86:latest`).

2. **Image**  
   The template defaults to `ghcr.io/OWNER/sphere86:latest`.  
   If you want another channel, edit the repository tag manually:
   - `:beta`
   - explicit versions (for example `:v1.1.0-beta`)

3. **Template URL**  
   After you push to GitHub, set `<TemplateURL>` to the raw URL of this file on your default branch, for example:  
   `https://raw.githubusercontent.com/OWNER/sphere86/main/tools/unraid/sphere86.xml`

## What the template configures

| Setting | Purpose |
|--------|---------|
| **Sphere86 Web UI** port `3000` | Publishes the Sphere86 HTTP port. |
| **Sunshine API/Web UI** port `47990` | Publishes Sunshine API + HTTPS UI. |
| **Sunshine stream/discovery ports** | Publishes Moonlight-relevant ports (`47984`, `47989`, `48010`, plus UDP mappings). |
| **Optional devices** | `/dev/uinput`, `/dev/uhid`, `/dev/snd` for input/audio passthrough in constrained hosts. |
| **Sphere86 Data** → `/data/sphere86` | Persistent volume for SQLite, logs and cache. |
| **Sunshine Data** → `/data/sunshine` | Persistent Sunshine config and credentials. |
| **86Box Data** → `/data/86box` | Persistent VM configs/images and ROM storage. |
| **SPHERE86_SECRET** | Required. Min 32 characters; encrypts stored credentials. Keep stable across container recreates. |
| **DATABASE_URL** | Default `file:/data/sphere86/config/sphere86.db`. |
| **SPHERE86_DATA_ROOT** | Default `/data/sphere86`. |
| **BOX86_CONFIG_BASE_PATH** | Default `/data/86box`. |
| **SPHERE86_EMBEDDED_HOST_PUBLIC_ADDRESS** | Optional override for embedded host links shown in Sphere86 UI. |
| **SPHERE86_SUNSHINE_NAME** | Sunshine host name shown in Moonlight (`sunshine_name`). |
| **SPHERE86_USE_XORG** | Display server: `auto` (Xorg when available), `true`/`false`. Xorg is required for Sunshine mouse/keyboard. |
| **SPHERE86_FORCE_XTEST_INPUT** | `false` (default). Set `true` only for legacy Xvfb mode. |
| **SUNSHINE_FORCE_INIT_CREDS** | Keep `false` to preserve existing Moonlight pairing; set `true` only when intentionally resetting Sunshine credentials. |
| **NODE_ENV** | `production` |
| **PORT** | Internal Sphere86 HTTP port (default 3000). |
| **HOST** | `0.0.0.0` so the server listens inside the container. |

These align with `Dockerfile` defaults and `docker-compose.yml` for embedded mode.

## Adding the template in Unraid

1. **Community Applications** → **Install** → **Click Here To Get More Apps From Template Repositories** (or **Apps** → **Previous Apps** → add template URL depending on Unraid version).  
2. Paste the raw GitHub URL to `sphere86.xml`.  
3. Install the template and fill:
   - **SPHERE86_SECRET**
   - **Sphere86 Data** path
   - **Sunshine Data** path
   - **86Box Data** path
   - optional image tag change in **Repository** (latest/beta/version)

## Checklist

- [ ] Three persistent paths are set: `/data/sphere86`, `/data/sunshine`, `/data/86box`.  
- [ ] `SPHERE86_SECRET` is set and at least 32 characters.  
- [ ] `PORT` and host web port match if you change defaults.  
- [ ] If embedded host links should use the container IP/hostname, set `SPHERE86_EMBEDDED_HOST_PUBLIC_ADDRESS`.
