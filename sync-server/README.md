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
```

Generate manifest:

```bash
docker compose exec sync-server node generate-manifest.js /data
```
