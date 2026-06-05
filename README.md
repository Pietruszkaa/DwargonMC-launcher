# DwargonMC

Monorepo dla launchera, sync-servera i stron v2.

## Struktura

```text
launcher/       Electron + React/Vite launcher
sync-server/    Fastify read-only sync, backgrounds, health and map proxy
download-site/  Static download page placeholder
admin-site/     Static/light admin panel placeholder
docs/           Plans and backlog
```

## Launcher

```bash
npm --prefix launcher install
npm --prefix launcher run dev
```

W drugim terminalu:

```bash
npm --prefix launcher run dev:electron
```

Build produkcyjny renderera i procesu Electron:

```bash
npm --prefix launcher run build
```

Windows portable:

```bash
npm --prefix launcher run dist:win
```

Dane launchera sa trzymane obok aplikacji:

- `minecraft/`
- `launcher-data/settings.json`
- `launcher-data/profile.json`
- `assets/backgrounds/`

## Sync server

Dodaj pliki paczki do `sync-server/files/`, np. `sync-server/files/mods/sodium.jar`, a potem wygeneruj manifest:

```bash
cd sync-server
npm install
npm run manifest
```

Uruchom sync-server:

```bash
npm start
```

Domyslnie slucha na `0.0.0.0:2121`. Wazne zmienne:

- `PORT=2121`
- `BIND_HOST=127.0.0.1`
- `PUBLIC_URL=https://dwargonmc-sync.petershub.xyz`
- `MAP_TARGET=http://127.0.0.1:8888`
- `MAP_ACCESS_CLIENT_ID=...` opcjonalnie, gdy `MAP_TARGET` jest za Cloudflare Access
- `MAP_ACCESS_CLIENT_SECRET=...` opcjonalnie, gdy `MAP_TARGET` jest za Cloudflare Access
- `MAP_REQUEST_HEADERS='{"x-map-token":"secret"}'` opcjonalne dodatkowe naglowki do upstreamu mapy
- `MC_HOST=127.0.0.1`
- `MC_PORT=25565`

Jesli blad Cloudflare Access pojawia sie bezposrednio na publicznym URL `dwargonmc-sync.petershub.xyz/map/`, request nie dociera do sync-servera i trzeba wylaczyc Access/bypass dla publicznej sciezki lub domeny. Naglowki `MAP_ACCESS_*` pomagaja tylko wtedy, gdy to sync-server odpytuje chroniony `MAP_TARGET`.

Przyklad unit service jest w `sync-server/systemd/dwargonmc-sync-server.service`.

Sync-server jest samodzielnym programem. Na serwer mozna przeniesc sam folder `sync-server/`, uruchomic w nim `npm install`, wrzucic pliki do `files/`, tla do `backgrounds/`, wygenerowac manifest i odpalic `npm start`.

## Sync rules

Sync-server trzyma pliki bez prefixu. Launcher zapisuje lokalnie tylko zarzadzane pliki z `_`, np. `mods/sodium.jar` z manifestu staje sie `minecraft/mods/_sodium.jar`. Pliki gracza bez `_` nie sa ruszane.

Jesli sync-server nie odpowiada, launcher pokazuje ostrzezenie, ze pliki nie zostaly zweryfikowane, ale nie blokuje startu gry.

## Verification

```bash
npm --prefix launcher run typecheck
npm --prefix launcher test
npm --prefix launcher run build
```

## Docs

- `docs/Plan-v1.md`
- `docs/release.md`
- `docs/v2-features.md`
