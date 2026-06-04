# DwargonMC Launcher v1

Portable Electron + React launcher dla Minecraft 1.21.1 NeoForge non-premium oraz read-only backend Fastify do manifestu, plików, mapy i health.

## Launcher

```bash
npm install
npm run dev
```

W drugim terminalu:

```bash
npm run dev:electron
```

Build produkcyjny renderera i procesu Electron:

```bash
npm run build
```

Windows portable:

```bash
npm run dist:win
```

Dane launchera są trzymane obok aplikacji:

- `minecraft/`
- `launcher-data/settings.json`
- `launcher-data/profile.json`
- `assets/backgrounds/`

## Backend

Dodaj pliki paczki do `server-backend/files/`, np. `server-backend/files/mods/sodium.jar`, a potem wygeneruj manifest:

```bash
cd server-backend
npm install
npm run manifest
```

Uruchom backend:

```bash
npm start
```

Domyślnie słucha na `0.0.0.0:2121`. Ważne zmienne:

- `PORT=2121`
- `BIND_HOST=127.0.0.1`
- `PUBLIC_URL=https://dwargonmc-sync.petershub.xyz`
- `MAP_TARGET=http://127.0.0.1:8888`
- `MAP_ACCESS_CLIENT_ID=...` opcjonalnie, gdy `MAP_TARGET` jest za Cloudflare Access
- `MAP_ACCESS_CLIENT_SECRET=...` opcjonalnie, gdy `MAP_TARGET` jest za Cloudflare Access
- `MAP_REQUEST_HEADERS='{"x-map-token":"secret"}'` opcjonalne dodatkowe nagłówki do upstreamu mapy
- `MC_HOST=127.0.0.1`
- `MC_PORT=25565`

Jeśli błąd Cloudflare Access pojawia się bezpośrednio na publicznym URL `dwargonmc-sync.petershub.xyz/map/`, to request nie dociera do backendu i trzeba wyłączyć Access/bypass dla publicznej ścieżki lub domeny. Nagłówki `MAP_ACCESS_*` pomagają tylko wtedy, gdy to backend odpytuje chroniony `MAP_TARGET`.

Przykład unit service jest w `server-backend/systemd/dwargonmc-backend.service`.

Backend jest samodzielnym programem. Na serwer można przenieść sam folder `server-backend/`, uruchomić w nim `npm install`, wrzucić pliki do `files/`, tła do `backgrounds/`, wygenerować manifest i odpalić `npm start`.

## Sync

Backend trzyma pliki bez prefixu. Launcher zapisuje lokalnie tylko zarządzane pliki z `_`, np. `mods/sodium.jar` z manifestu staje się `minecraft/mods/_sodium.jar`. Pliki gracza bez `_` nie są ruszane.

Jeśli backend nie odpowiada, launcher pokazuje ostrzeżenie, że pliki nie zostały zweryfikowane, ale nie blokuje startu gry.

## Weryfikacja

```bash
npm run typecheck
npm test
npm run build
```
