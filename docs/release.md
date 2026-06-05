# Release process

## Windows launcher

Release pipeline jest oparty o GitHub Releases.

1. Zmien wersje w:
   - `launcher/package.json`
   - `launcher/package-lock.json`
   - root `package.json`

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
   - ustawia wersje `launcher/package.json` z taga `vX.Y.Z` przed buildem;
   - buduje Windows portable `.exe`;
   - generuje `SHA256SUMS.txt`;
   - jesli ustawiono sekret `VIRUSTOTAL_API_KEY`, wysyla `.exe` do VirusTotal i dopisuje raport do opisu release;
   - publikuje pliki w GitHub Release.

## VirusTotal

Skan VirusTotal jest opcjonalny i dziala tylko w workflow `Release`.

Wymagany sekret repo:

```text
VIRUSTOTAL_API_KEY
```

Jesli sekret nie istnieje, workflow pomija skan i publikuje release bez linku VirusTotal. Jesli sekret istnieje, ale upload albo API zwroci blad, release zatrzyma sie przed publikacja assetow.

## Notes

- Auto-update v2 czyta GitHub Releases z `Pietruszkaa/DwargonMC-launcher`.
- Launcher szuka assetu `.exe`; `SHA256SUMS.txt` jest pokazywany jako dodatkowy plik release.
- Release nie powinien zawierac `minecraft/`, `launcher-data/`, `release/` z lokalnego komputera ani paczek sync-servera.
- Unsigned build moze byc blokowany przez Microsoft Smart App Control/SmartScreen. Do czasu podpisywania kodu strona pobierania powinna pokazac instrukcje `Wlasciwosci -> Odblokuj`.
