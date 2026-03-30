# Unraid Docker template

This folder contains `sphere86.xml`, a template compatible with Unraid’s **Community Applications** (CA) “add from URL” flow.

## Before you use it

1. **Replace placeholders**  
   Open `sphere86.xml` and replace every `OWNER` with your GitHub username or organization (the same segment used in your container image path, e.g. `ghcr.io/myorg/sphere86:latest`).

2. **Image**  
   The template expects an image such as `ghcr.io/OWNER/sphere86:latest`. Build and push an image from this repository, or adjust **Repository** to your registry and tag.

3. **Template URL**  
   After you push to GitHub, set `<TemplateURL>` to the raw URL of this file on your default branch, for example:  
   `https://raw.githubusercontent.com/OWNER/sphere86/main/tools/unraid/sphere86.xml`

## What the template configures

| Setting | Purpose |
|--------|---------|
| **Web UI** port `3000` | Publishes the Sphere86 HTTP port. |
| **Data** → `/data` | Persistent volume for SQLite (`/data/config/sphere86.db` by default), generated configs, `vms/`, `roms/`, etc. |
| **SPHERE86_SECRET** | Required. Min 32 characters; encrypts stored credentials. Keep stable across container recreates. |
| **DATABASE_URL** | Default `file:/data/config/sphere86.db` — matches the app default and `docker-compose.yml`. |
| **SHARE_ROOT** | Default `/data` — must match the data volume mount. |
| **NODE_ENV** | `production` |
| **PORT** | Should match the published container port (3000). |
| **HOST** | `0.0.0.0` so the server listens inside the container. |

These align with `Dockerfile` defaults and `docker-compose.yml` (except compose also uses `SPHERE86_DATA_DIR` for the host side of the bind mount).

## Adding the template in Unraid

1. **Community Applications** → **Install** → **Click Here To Get More Apps From Template Repositories** (or **Apps** → **Previous Apps** → add template URL depending on Unraid version).  
2. Paste the raw GitHub URL to `sphere86.xml`.  
3. Install the template and fill **SPHERE86_SECRET** and the **Data** host path (e.g. `/mnt/user/appdata/sphere86`).

## Checklist

- [ ] Data path on the array/cache is set and mapped to `/data`.  
- [ ] `SPHERE86_SECRET` is set and at least 32 characters.  
- [ ] Host port and `PORT` env both use the same value if you change the default.  
- [ ] Do not change `SHARE_ROOT` or `DATABASE_URL` unless you understand the layout under `/data`.
