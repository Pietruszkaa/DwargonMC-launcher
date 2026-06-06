# DwargonMC admin site

Lekki panel administracyjny dla contentu sync-servera.

Zakres:

- edycja `announcements.json` przez `PUT /admin/announcements.json`;
- edycja `server.json` przez `PUT /admin/server.json`;
- podglad manifestu, tla, statusu i proxy mapy;
- zabezpieczenie operacji zapisu;
- brak bazy danych.

Wymagane po stronie `sync-server`:

```text
ADMIN_TOKEN=dlugi-losowy-token
```

Pusty `ADMIN_TOKEN` oznacza brak wymaganego tokenu, co ma sens tylko za VPN.

Panel nie zapisuje tokenu admina w `localStorage`.

Docker:

```bash
docker compose up -d --build
```
