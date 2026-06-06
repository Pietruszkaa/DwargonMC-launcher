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
   - ustawia wersje root `package.json`, `launcher/package.json` i `launcher/package-lock.json` z taga `vX.Y.Z` przed buildem;
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

- Updater launchera czyta GitHub Releases z `Pietruszkaa/DwargonMC-launcher`.
- Launcher szuka assetu `.exe`; `SHA256SUMS.txt` sluzy do weryfikacji pobranego pliku aktualizacji.
- Publiczna strona pobierania jest opcjonalna. GitHub Releases sa glownym zrodlem `.exe`, SHA256 i raportu VirusTotal.
- Release nie powinien zawierac `minecraft/`, `launcher-data/`, `release/` z lokalnego komputera ani paczek sync-servera.

## Windows SmartScreen / Smart App Control

Microsoft SmartScreen albo Smart App Control moga zablokowac uruchomienie na czesci komputerow.

Przed odblokowaniem pliku gracz powinien:

1. Pobrac `.exe` z GitHub Release albo przez updater launchera.
2. Sprawdzic, czy SHA256 zgadza sie z `SHA256SUMS.txt`.
3. Opcjonalnie sprawdzic link VirusTotal w opisie release.
4. Jesli Windows nadal blokuje plik: `Wlasciwosci` -> `Odblokuj` -> `Zastosuj`.

Nie nalezy omijac ostrzezen systemu dla plikow pobranych spoza oficjalnego GitHub Release projektu.
