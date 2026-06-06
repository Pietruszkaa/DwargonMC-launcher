# DwargonMC Launcher

Desktop launcher for a Minecraft selfhosted servers, with auto runtime installation, java version verification and installation and mods synchroninzation from the server. The launcher is built around a portable Windows `.exe`, local instance data, server-managed file sync, optional Microsoft login, and a small read-only sync backend.

The current repository ships the DwargonMC configuration, but the long-term direction is a reusable launcher core with server-specific branding/configuration.

## Features

- Electron desktop shell with React/Vite renderer.
- Minecraft `1.21.1` NeoForge launch through `minecraft-launcher-core`.
- Non-premium/offline mode as the default account flow.
- Optional Microsoft login through `MSMC`.
- Server-managed sync with SHA256 verification.
- Local file safety: sync manages only server-owned files and does not remove player files.
- Background image sync and rotation.
- Backend, Minecraft server, player list, and map health polling.
- Map proxy support through the sync server.
- Crash modal with recent logs and copy support.
- First-run setup for Windows portable builds.
- Update notification through GitHub Releases.
- Local playtime tracking.
- Modrinth browser for optional client-side mods, shaders, and resource packs.
- Admin announcements backed by a JSON file.

## Repository Layout

```text
launcher/       Electron + React/Vite desktop app
sync-server/    Fastify sync backend, health endpoint, map proxy, announcements
admin-site/     Static admin UI for announcements and backend inspection
docs/           Planning and release documentation
```

## Requirements

- Node.js `22` for development and CI.
- npm.
- Java `21+` recommended on player machines.
- Windows for production launcher release builds.

Linux launcher builds are not part of the current release target.

## Quick Start

Install workspace dependencies:

```bash
npm install --prefix launcher
npm install --prefix sync-server
```

Run the launcher renderer:

```bash
npm run launcher:dev
```

Run Electron in a second terminal:

```bash
npm run launcher:dev:electron
```

Validate the launcher:

```bash
npm run launcher:typecheck
npm run launcher:test
npm run launcher:build
```

Build Windows portable output:

```bash
npm run launcher:dist:win
```

Build artifacts are written to `launcher/release/`.

## Runtime Data

Portable builds keep player data next to the application/instance:

```text
minecraft/
launcher-data/settings.json
launcher-data/profile.json
assets/backgrounds/
```

These paths are runtime data and must stay out of git.

## Sync Server

`sync-server/` is a standalone Fastify application. It can be deployed independently from the launcher.

Install and run:

```bash
cd sync-server
npm ci --omit=dev
npm start
```

Generate the sync manifest after changing files or backgrounds:

```bash
npm run manifest
```

Public endpoints:

```text
GET /health
GET /manifest.json
GET /announcements.json
GET /files/*
GET /backgrounds/*
GET /map
GET /map/*
```

Admin endpoint:

```text
PUT /admin/announcements.json
Authorization: Bearer <ADMIN_TOKEN>
```

Main environment variables:

```text
PORT=2121
BIND_HOST=0.0.0.0
PUBLIC_URL=https://sync.example.com
MAP_TARGET=http://127.0.0.1:8888
MC_HOST=127.0.0.1
MC_PORT=25565
ADMIN_TOKEN=
MAP_ACCESS_CLIENT_ID=
MAP_ACCESS_CLIENT_SECRET=
MAP_REQUEST_HEADERS=
```

`ADMIN_TOKEN` is required for write operations. Public launcher traffic remains read-only.

## Docker / Dockage

The root `docker-compose.yml` is designed for simple Dockage-style deployment. It uses official base images and bind mounts local project folders instead of building custom images.

Copy `.env.example` to `.env` and adjust paths/domains:

```bash
cp .env.example .env
```

Start the stack:

```bash
docker compose up -d
```

Default services:

```text
2121 - sync-server
8082 - admin-site
```

If the Minecraft server or map is hosted on the same machine, `network_mode: host` lets the sync server reach local services through `127.0.0.1`.

Generate the manifest inside the root compose:

```bash
docker compose exec sync-server node /data/generate-manifest.js /data
```

Backend data layout:

```text
sync-server/files/
sync-server/backgrounds/
sync-server/manifest.json
sync-server/announcements.json
```

## Sync Rules

The backend stores files without the local managed prefix. The launcher writes server-managed files locally with `_`.

Example:

```text
sync-server/files/mods/sodium.jar
minecraft/mods/_sodium.jar
```

The launcher may update or remove only managed orphan files. Player files without the managed prefix are not touched by sync.

If the backend is unavailable, the launcher warns that files were not verified but does not block game launch.

## Release

Windows releases are published through GitHub Actions and GitHub Releases.

Release flow:

1. Create a version tag:

```bash
git tag v1.2.0
git push origin main --tags
```

2. The release workflow:

- applies the tag version to package metadata;
- installs launcher and sync-server dependencies;
- runs typecheck and tests;
- builds the Windows portable `.exe`;
- generates `SHA256SUMS.txt`;
- optionally uploads the `.exe` to VirusTotal when `VIRUSTOTAL_API_KEY` is configured;
- publishes assets to GitHub Releases.

Details: [docs/release.md](docs/release.md).

## Security

- Public sync endpoints are read-only.
- Admin writes require `ADMIN_TOKEN`.
- Microsoft tokens stay local to the launcher profile and are not sent to the sync backend.
- Runtime data, release artifacts, logs, Minecraft files, and server pack contents should not be committed unless intentionally published.
- Known remaining npm audit findings currently come from `minecraft-launcher-core -> request`. They require replacing, patching, or forking that dependency.

Report security issues privately when possible. See [SECURITY.md](SECURITY.md).

## Project Status

This is an active private/server-focused launcher project. The repo is public for transparency and CI/release distribution, but the current branding and default endpoints are still DwargonMC-specific.
