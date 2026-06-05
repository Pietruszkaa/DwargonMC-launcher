# Release process

## Windows launcher

Release pipeline jest oparty o GitHub Releases.

1. Zmien wersje w:
   - `launcher/package.json`
   - `launcher/package-lock.json`
   - root `package.json`
   - UI, jesli wersja jest wyswietlana recznie

2. Lokalna weryfikacja:

```bash
npm run launcher:typecheck
npm run launcher:test
npm run launcher:build
```

3. Commit i tag:

```bash
git tag v1.2.0
git push origin main --tags
```

4. GitHub Actions `Release`:
   - instaluje zaleznosci `launcher/` i `sync-server/`;
   - uruchamia typecheck i testy;
   - buduje Windows portable `.exe`;
   - generuje `SHA256SUMS.txt`;
   - publikuje pliki w GitHub Release.

## Notes

- Auto-update v2 ma czytac GitHub Releases jako zrodlo nowych wersji.
- Release nie powinien zawierac `minecraft/`, `launcher-data/`, `release/` z lokalnego komputera ani paczek sync-servera.
- Unsigned build moze byc blokowany przez Microsoft Smart App Control/SmartScreen. Do czasu podpisywania kodu strona pobierania powinna pokazac instrukcje `Wlasciwosci -> Odblokuj`.

