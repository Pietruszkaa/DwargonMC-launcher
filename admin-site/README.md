# DwargonMC admin site

Lekki panel administracyjny dla contentu sync-servera.

Planowany zakres v2:

- edycja `announcements.json` przez `PUT /admin/announcements.json`;
- podglad manifestu, tla, statusu i proxy mapy;
- zabezpieczenie operacji zapisu;
- brak bazy danych w v2.

Wymagane po stronie `sync-server`:

```text
ADMIN_TOKEN=dlugi-losowy-token
```

Panel nie zapisuje tokenu admina w `localStorage`.

Docker:

```bash
docker compose up -d --build
```
