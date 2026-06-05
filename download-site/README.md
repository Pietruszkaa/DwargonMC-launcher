# DwargonMC download site

Statyczna strona pobierania launchera.

Planowany zakres v2:

- najnowszy Windows `.exe`;
- SHA256 najnowszego buildu;
- link do GitHub Releases;
- link VirusTotal, jesli jest w opisie release;
- status serwera z `/health`;
- krotka instrukcja instalacji i odblokowania pliku w Windows;
- link do mapy, statusu i Discorda, jesli beda potrzebne.

Docker:

```bash
docker compose up -d --build
```
