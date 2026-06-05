# Launcher v3 - draft plan

## Cel v3

V3 ma wyciagnac launcher z fazy "DwargonMC-specific" do utrzymywalnego, bezpieczniejszego launchera dla wielu serwerow/instancji, z normalnym updaterem, podpisywaniem aplikacji i lepszym panelem admina. DwargonMC zostaje pierwszym domyslnym profilem, ale kod nie powinien byc na stale przyklejony do jednej domeny, nazwy i paczki.

## Assumptions

- Non-premium first zostaje glownym trybem.
- GitHub Releases zostaja glownym miejscem publikacji buildow.
- Backend sync zostaje prosty i plikowy, bez bazy danych, dopoki admin-site nie zacznie potrzebowac historii/rol/statystyk.
- Branding i konfiguracja serwera w v3 moga byc pobierane z backendu, ale musza miec lokalny fallback.
- Chat z launchera jest tylko pomyslem bonusowym, nie celem v3.
- Download site moze zostac ograniczony albo usuniety, jesli GitHub Releases i updater robia cala robote dystrybucji.

## Priorytet A - Release, updater, signing

### Podpisywanie aplikacji

Rekomendacja: podpisywanie w GitHub Actions, nie lokalnie.

Powody:
- release build i podpis sa powtarzalne;
- certyfikat/sekrety nie laduja na lokalnych maszynach;
- latwiej wymusic, ze tylko tagowany release jest podpisywany;
- pasuje do obecnego flow GitHub Releases.

Opcje:
- standardowy code signing certificate zapisany jako sekret/plik w GitHub Actions;
- docelowo lepiej EV/OV cert albo provider z KMS/HSM, jesli koszt ma sens;
- lokalne podpisywanie tylko jako fallback awaryjny, nie standard.

Do zrobienia:
- dodac etap sign po buildzie `.exe`;
- dopiero podpisany plik wysylac do VirusTotal;
- release notes powinny pokazywac SHA256 podpisanego pliku;
- dokumentacja: jak odnawiac certyfikat i gdzie jest uzywany.

### Lepszy updater

V2 pobiera nowy `.exe`. V3 powinno miec normalny updater:
- pobieranie w tle z widocznym progresem;
- restart aplikacji po zgodzie uzytkownika;
- weryfikacja SHA256 i podpisu;
- rollback/fallback, jesli update sie nie uda;
- jasny stan: sprawdzanie, pobieranie, gotowe do instalacji, blad;
- mozliwosc pominiecia konkretnej wersji.

Kierunki:
- `electron-updater` + GitHub Releases, jesli da sie sensownie pogodzic z portable;
- wlasny updater helper, jesli portable single-exe bedzie konfliktowal z gotowymi mechanizmami;
- release manifest `latest.yml/json` generowany w Actions, podpisany lub przynajmniej hashowany.

### Jawniejsze pobieranie Javy

- popup nie powinien "wisiec", a potem nagle otwierac instalatora;
- pokazac rozmiar, zrodlo i link Oracle przed pobraniem;
- pasek postepu pobierania;
- przycisk: `Pobierz instalator`, `Otworz strone`, `Wskaz java.exe`;
- po pobraniu: `Uruchom instalator` i `Sprawdz ponownie`;
- nie instalowac cicho i nie modyfikowac PATH samodzielnie.

## Priorytet B - Multi-server i branding

### Generic launcher core

Repo i kod powinny przestac zakladac DwargonMC jako jedyny serwer.

Do zrobienia:
- wyciagnac `DwargonMC`, domeny, IP, kolory, linki i teksty do configu;
- zmienic nazwy katalogow/kodu, gdzie sa technicznie generic;
- zostawic branding DwargonMC jako domyslny preset;
- README opisuje projekt jako launcher template/core + konfiguracja DwargonMC.

### Branding per backend/server

Proponowany format: `branding.json`, bo UI i backend juz naturalnie pracuja na JSON.

Minimalny przyklad:

```json
{
  "id": "dwargonmc",
  "name": "DwargonMC",
  "launcherTitle": "DwargonMC Launcher",
  "backendUrl": "https://dwargonmc-sync.petershub.xyz",
  "serverAddress": "dwargonmc.playit.plus",
  "mapUrl": "/map/",
  "colors": {
    "accent": "#d9b45f",
    "panel": "rgba(0, 0, 0, 0.55)",
    "text": "#f2efe8"
  },
  "assets": {
    "logo": "logo.png",
    "icon": "icon.png",
    "backgroundsPath": "backgrounds/"
  },
  "links": {
    "discord": null,
    "releases": "https://github.com/Pietruszkaa/DwargonMC-launcher/releases"
  }
}
```

Zasady:
- lokalny bundled branding jako fallback;
- backend moze podac branding runtime;
- launcher nie powinien slepo wykonywac zdalnych linkow/skryptow;
- assety brandingu musza miec limity rozmiaru i content-type.

### Wiele instancji per backend/server

Model:
- `launcher-data/servers/<serverId>/profile.json`
- `launcher-data/servers/<serverId>/settings.json`
- `instances/<serverId>/minecraft/`
- `instances/<serverId>/assets/`

UI:
- wybor serwera/instancji w launcherze;
- dodaj backend przez URL;
- aktywna instancja ma wlasny sync, profile, RAM, Java path, Modrinth dodatki i statystyki;
- import/export instancji jako plik JSON bez sekretow.

Ryzyka:
- migracja obecnej pojedynczej instancji;
- przypadkowe mieszanie modow miedzy serwerami;
- bezpieczenstwo zdalnego brandingu i endpointow.

## Priorytet C - Bezpieczenstwo i maintenance

### Sync i manifest

- podpis manifestu albo przynajmniej jawny `manifestSha256`;
- weryfikacja SHA256 kazdego pliku zostaje wymagana;
- nadal usuwac tylko zarzadzane pliki z prefixem `_` albo z jawnego manifestu;
- limity rozmiaru plikow i liczby wpisow;
- twarda ochrona przed path traversal;
- jasny User-Agent launchera.

### Backend/admin

- admin-site przez VPN moze zostac prosty, ale token nadal warto zostawic jako druga warstwe;
- CSRF/basic token handling, nawet przy VPN;
- walidacja JSON przed zapisem;
- backup poprzedniego `announcements.json`;
- audit log lokalny: kto/kiedy/co zmienil, jesli pojawia sie auth user;
- rate limit read-only endpointow zostaje.

### Local security

- tokeny Microsoft przez bezpieczny storage OS, jesli biblioteka nie komplikuje builda;
- logi i eksport diagnostyki musza maskowac tokeny, sciezki usera opcjonalnie;
- CSP dla renderer UI;
- ograniczyc `shell.openExternal` do http/https i znanych linkow;
- preload API zostaje waskie, bez ogolnego fs/shell;
- testy security dla path traversal, manifestu, URL validation i redakcji sekretow.

### Repo maintenance

- usunac lub odseparowac rzeczy DwargonMC-specific;
- nazwy paczek i folderow generic tam, gdzie ma to sens;
- dokumentacja release/signing/update;
- checklisty przed tagiem;
- clean scripts dla lokalnych release/cache.

## Priorytet D - UX i admin-site

### Ustawienia i jezyki

- na teraz mozna usunac angielski z ustawien, jesli nie bedzie pelnych tlumaczen;
- alternatywa: zostawic i18n, ale zrobic kompletne tlumaczenia jednym systemem;
- nie mieszac jezykow w UI.

### Admin-site

- lepszy edytor wiadomosci:
  - lista komunikatow;
  - poziom: info/warning/maintenance/update;
  - data start/end;
  - link opcjonalny;
  - preview jak w launcherze;
  - walidacja przed zapisem.
- podglad health, manifestu i backgrounds;
- przycisk generowania manifestu tylko jesli backend dostanie bezpieczny sposob wykonania tej akcji;
- na start bez bazy, nadal pliki JSON.

### Download site

Kierunek: zdegradowac albo usunac.

Jesli zostaje:
- tylko statyczna strona informacyjna;
- link do najnowszego GitHub Release;
- SHA256 i VirusTotal z release notes.

Jesli znika:
- README i GitHub Releases staja sie glownym miejscem pobierania;
- updater przejmuje komunikacje o nowych wersjach.

## Bonus / Later

### Chat z launchera

Pomysl ciekawy, ale wysoki koszt utrzymania.

Wymagania:
- custom plugin po stronie serwera;
- autoryzacja gracza, zeby nie podszywac sie pod nick;
- najlepiej powiazanie z sesja launchera albo tokenem jednorazowym;
- moderacja/rate limit;
- kompatybilnosc z wersjami MC i loaderami.

Ryzyka:
- non-premium nick nie jest tozsamoscia;
- osobny plugin/mod dla roznych wersji to maintenance hell;
- latwo zrobic boczna furtke do spamowania czatu.

Decyzja robocza: funny mention, nie zakres v3.

### AuthMe Reloaded / non-premium auth

- plugin typu AuthMe Reloaded moze pomoc na serwerze non-premium;
- launcher moze w przyszlosci wykrywac instrukcje logowania/rejestracji;
- nie przechowywac hasel serwera w launcherze;
- nie integrowac automatycznego `/login` bez bardzo dobrego powodu.

## Dodatkowe Pomysly

- `repair report`: po crashu launcher sugeruje konkretne kroki na podstawie znanych wzorcow logow.
- `compatibility warnings`: ostrzezenia przy modach klienta, ktore moga konfliktowac z paczka serwera.
- `server maintenance mode`: backend moze pokazac blokujacy komunikat, ale start gry nadal nie powinien byc blokowany bez mocnego powodu.
- `config migration`: wersjonowane migracje lokalnych ustawien i instancji.
- `safe mode`: start bez dodatkow gracza, tylko paczka serwerowa.
- `export support pack`: zip z logami i metadanymi bez sekretow.
- `release channels`: stable/beta/nightly, jesli testerzy beda dostawac buildy przed graczami.
- `instance lock`: nie pozwalac uruchomic synca/startu dwa razy na tej samej instancji.
- `disk space preflight`: sprawdzanie miejsca przed sync/update.

## Decision Log

- Signing: preferowane w GitHub Actions, bo release pipeline jest juz tag-based i czysty.
- Branding: preferowany JSON, bo najprostszy dla backendu, UI i walidacji.
- Multi-instance: dane per serverId, z migracja obecnej instancji jako DwargonMC default.
- Updater: v3 ma odejsc od prostego pobierania `.exe` w strone updatera z progresem, weryfikacja i restartem.
- Download site: nie rozwijac mocno; GitHub Releases i updater maja byc glownym kierunkiem.
- Chat: odlozony jako bonus przez ryzyko autoryzacji i utrzymania pluginow/modow.
