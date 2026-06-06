# DwargonMC sync-server

Read-only backend Fastify dla launchera DwargonMC.

## Docker

Start przez compose:

```bash
docker compose up -d --build
```

Backend montuje ten folder jako `/data` w kontenerze i uzywa rootu folderu na dane:

```text
files/
backgrounds/
manifest.json
announcements.json
server.json
```

Generate manifest:

```bash
docker compose exec sync-server node generate-manifest.js /data
```

`server.json` moze byc edytowany przez admin-site. `MC_LOADER_VERSION=latest` oznacza automatyczne dobranie najnowszego wspieranego NeoForge po stronie launchera.
