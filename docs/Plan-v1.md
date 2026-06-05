# Plan v1.0 — CustomLauncher

> Minecraft 1.21.1 NeoForge · Non-premium · Windows + Linux  
> Backend na tej samej maszynie co MC (Ubuntu, Pelican Panel) · Cloudflare Tunnel

---

## Stack

| Warstwa | Technologia |
|---------|------------|
| Launcher shell | Electron 30 |
| UI | React 18 + Vite + Tailwind CSS |
| Animacje | Framer Motion |
| Stan | Zustand |
| Tłumaczenia | react-i18next (PL/EN) |
| Pobieranie i uruchamianie MC | **minecraft-launcher-core (MCLC)** |
| HTTP (launcher) | axios |
| Buildy | electron-builder → .exe (NSIS) + .AppImage |
| Backend | Fastify 4 + Node.js 20, port 2121 |
| Deployment | Docker Compose lub systemd .service |

---

## Zasada prefixu `_`

Pliki w backendzie są bez prefixu (np. `sodium.jar`). Launcher przy pobieraniu nakłada prefix `_` przy zapisie (`_sodium.jar`). Launcher zarządza wyłącznie plikami z `_` — pliki gracza bez prefixu są nietykalme.

---

## Pliki obok exe

Wszystkie pliki robocze leżą obok pliku wykonywalnego (nie w AppData). Na Linux AppImage — obok pliku `.AppImage`.

```
[instalacja]/
├── Launcher.exe lub Launcher.AppImage
├── assets/backgrounds/
├── minecraft/           ← root MCLC
│   ├── mods/_*.jar
│   ├── config/
│   └── java/            ← izolowana Java (opcja)
└── launcher-data/
    ├── settings.json
    └── profile.json
```

---

## Backend

- Port 2121, Fastify, JavaScript
- `GET /manifest.json` — lista plików z checksumami i wersjami
- `GET /files/:name` — serwuje plik z `files/`
- `GET /backgrounds/:name` — tła
- `GET /map/*` — reverse proxy → `localhost:8080` (SquareMap)
- `GET /health` — status + gracze przez RCON

`generate-manifest.js` — skrypt skanujący `files/`, obliczający SHA256, generujący `manifest.json`. Uruchamiany ręcznie po dodaniu/usunięciu pliku.

---

## Launcher

**MCLC** obsługuje całe pobieranie MC, bibliotek, assetów, uruchamia NeoForge installer i odpala JVM z poprawnym classpath. Nie implementujesz tego ręcznie — przekazujesz opcje i słuchasz eventów.

**game.js** — wrapper MCLC. Pobiera NeoForge installer JAR z Maven, przekazuje go MCLC przez opcję `forge`. Buduje obiekt opcji (nick, RAM, Java path, quickPlay dla auto-connect). Słucha eventów `data`, `close`, `progress`.

**sync.js** — sync plików z backendu. Pobiera manifest, weryfikuje SHA256 lokalnych plików, pobiera brakujące/zmienione, usuwa pliki z `_` których nie ma już w manifeście.

**Offline UUID** — `MD5("OfflinePlayer:" + nick)` sformatowany jako UUID.

**Java** — systemowa (z PATH, wymaga ≥ 21) lub izolowana (pobierana z Adoptium API do `minecraft/java/`).

**RAM guard** — suwak z maksimum 75% RAM systemu, domyślna wartość zależna od ilości RAM:
- ≤ 8 GB → 3072 MB · ≤ 12 GB → 6144 MB · > 12 GB → 8192 MB

---

## Widoki UI

- **Home** — tło (fade co 30s), nick z walidacją, avatar Crafatar, status serwera, przycisk GRAJ, progress bar
- **Ustawienia** — RAM suwak, FOV, checkboxy (zamknij launcher, auto-connect, pokaż logi), Java, język
- **Pliki** — lista zarządzanych plików, otwórz folder, wymuś re-sync
- **Mapa** — iframe/webview na `{backend}/map`
- **Logi** — live JVM output, widoczne gdy włączone w ustawieniach
- **CrashModal** — przy exit code ≠ 0, ostatnie 100 linii, sugestia AI/admin

---

## Buildy

GitHub Actions: `windows-latest` → `.exe`, `ubuntu-latest` → `.AppImage`. Trigger: tag `v*`.

---

## Co NIE wchodzi w v1.0

Auto-update launchera, panel admina, statystyki, sygnowanie manifestu, konta premium.
