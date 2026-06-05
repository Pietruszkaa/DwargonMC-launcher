# DwargonMC Launcher

Portable launcher desktopowy dla serwera Minecraft DwargonMC.

Launcher uruchamia Minecraft `1.21.1` z NeoForge, synchronizuje paczke plikow zarzadzanych przez serwer, pokazuje logi/crashe i obsluguje tryb non-premium/offline oraz opcjonalne logowanie Microsoft.

## Funkcje

- Electron + React/Vite jako aplikacja desktopowa.
- Start Minecraft `1.21.1` NeoForge przez `minecraft-launcher-core`.
- Tryb non-premium/offline jako domyslna sciezka konta.
- Opcjonalne logowanie Microsoft przez `MSMC`.
- Synchronizacja plikow z publicznego, read-only backendu Fastify.
- Ochrona plikow gracza: sync aktualizuje i usuwa tylko pliki zarzadzane z prefixem `_`.
- Synchronizacja i lokalna rotacja tla.
- Cykliczny health check backendu i serwera MC.
- Lista graczy, proxy mapy, logi i modal crasha.
- First-run setup dla Windows portable `.exe`.
- Powiadomienie o aktualizacji launchera z GitHub Releases.
- Lokalny licznik czasu gry.

## Struktura repo

```text
launcher/       Electron + React/Vite launcher
sync-server/    Fastify read-only sync server, health endpoint i proxy mapy
download-site/  Statyczna strona pobierania
admin-site/     Lekki panel admina
docs/           Dokumentacja planu i release
```

## Wymagania

- Node.js `20+`
- npm
- Java `21+` na komputerze gracza
- Windows dla produkcyjnych buildow launchera

Buildy Linux nie sa aktualnym celem release.

## Development

Instalacja zaleznosci:

```bash
npm install
```

Uruchomienie renderera:

```bash
npm run launcher:dev
```

Uruchomienie Electrona w drugim terminalu:

```bash
npm run launcher:dev:electron
```

Walidacja:

```bash
npm run launcher:typecheck
npm run launcher:test
npm run launcher:build
```

Build Windows:

```bash
npm run launcher:dist:win
```

Artefakty sa zapisywane w `launcher/release/`.

## Dane launchera

Windows portable build trzyma dane obok aplikacji:

```text
minecraft/
launcher-data/settings.json
launcher-data/profile.json
assets/backgrounds/
```

Te katalogi sa danymi runtime i nie powinny trafic do git.

## Sync server

`sync-server/` jest samodzielna aplikacja Fastify. Na serwer mozna przeniesc sam folder `sync-server/`, zainstalowac zaleznosci i uruchomic proces.

Instalacja i start:

```bash
cd sync-server
npm install
npm start
```

Po zmianie plikow w `sync-server/files/` albo `sync-server/backgrounds/` trzeba wygenerowac manifest:

```bash
npm run manifest
```

Publiczne endpointy:

```text
GET /health
GET /manifest.json
GET /announcements.json
GET /files/*
GET /backgrounds/*
GET /map
GET /map/*
```

Zmienne srodowiskowe:

```text
PORT=2121
BIND_HOST=0.0.0.0
PUBLIC_URL=https://example.com
MAP_TARGET=http://127.0.0.1:8888
MC_HOST=127.0.0.1
MC_PORT=25565
MAP_ACCESS_CLIENT_ID=
MAP_ACCESS_CLIENT_SECRET=
MAP_REQUEST_HEADERS=
```

`MAP_ACCESS_CLIENT_ID`, `MAP_ACCESS_CLIENT_SECRET` i `MAP_REQUEST_HEADERS` sa opcjonalnymi naglowkami dla chronionego upstreamu mapy. Dzialaja tylko wtedy, gdy to sync-server odpytuje `MAP_TARGET`.

Przykladowy unit systemd jest w `sync-server/systemd/dwargonmc-sync-server.service`.

## Zasady synca

Backend trzyma pliki bez prefixu zarzadzanego. Launcher zapisuje je lokalnie z `_`.

Przyklad:

```text
sync-server/files/mods/sodium.jar
minecraft/mods/_sodium.jar
```

Launcher moze aktualizowac albo usuwac tylko osierocone pliki zarzadzane z `_`. Pliki gracza bez `_` nie sa ruszane przez sync.

Jesli backend nie odpowiada, launcher pokazuje ostrzezenie, ze pliki nie zostaly zweryfikowane, ale nie blokuje startu gry.

## Release

Windows release jest publikowany przez GitHub Actions i GitHub Releases.

1. Zmien wersje w:
   - `package.json`
   - `launcher/package.json`
   - `launcher/package-lock.json`

2. Zweryfikuj lokalnie:

```bash
npm run launcher:typecheck
npm run launcher:test
npm run launcher:build
```

3. Wypchnij tag wersji:

```bash
git tag v1.2.0
git push origin main --tags
```

Workflow release ustawia wersje z taga `vX.Y.Z` w plikach package, buduje Windows portable `.exe`, generuje `SHA256SUMS.txt` i publikuje assety w GitHub Releases.
UI pokazuje wersje z `app.getVersion()`, a plik `.exe` dostaje nazwe w formacie `DwargonMC Launcher-X.Y.Z-portable.exe`.

Jesli w repo ustawiony jest sekret `VIRUSTOTAL_API_KEY`, workflow wysyla `.exe` do VirusTotal i dopisuje link do raportu w opisie release. Brak sekretu pomija skan bez przerywania buildu.

Niepodpisany build Windows moze byc blokowany przez SmartScreen albo Smart App Control na czesci komputerow. Do czasu podpisywania kodu uzytkownik moze potrzebowac odblokowac pobrany `.exe` we wlasciwosciach pliku.

Szczegoly: `docs/release.md`.

## Bezpieczenstwo

- Sync server jest read-only dla publicznego ruchu launchera.
- Tokeny Microsoft sa trzymane tylko lokalnie w profilu launchera i nie sa wysylane do backendu DwargonMC.
- Funkcje zapisu w panelu admina musza miec autoryzacje przed publicznym deployem.
- Artefakty release, dane runtime, logi, lokalne pliki Minecraft i zawartosc paczki modow nie powinny trafiac do git, jesli nie sa publikowane celowo.
