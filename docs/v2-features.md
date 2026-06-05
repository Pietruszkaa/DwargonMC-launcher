# DwargonMC Launcher v2 - feature backlog

## Cel v2

V2 ma zostac prostym launcherem dla graczy, ale dojsc do poziomu wygodnej dystrybucji:
instalacja bez recznego tlumaczenia folderow, aktualizacje launchera, lepszy status serwera,
wiadomosci od admina i pierwsze funkcje premium/Microsoft bez rozbudowanego panelu admina.

## Decyzje potwierdzone

- Non-premium first:
  - tryb offline/non-premium zostaje glowna sciezka;
  - Microsoft login jest opcjonalny, nie blokuje graczy non-premium.

- Auto-update:
  - przy starcie launcher pokazuje popup, jesli jest nowa wersja;
  - akcje: `Zaktualizuj` i `Nie teraz`;
  - update nie blokuje startu gry;
  - zrodlo aktualizacji: GitHub Releases;
  - sprzatanie repo wchodzi do Priorytetu A przed release pipeline.

- Admin content:
  - v2 trzyma wiadomosci/admin content w pliku JSON;
  - bez bazy danych.

- Customizacja pod inne serwery:
  - na v2 jako konfiguracja builda;
  - bez zmieniania brandingu po deployu.

- Modrinth browser:
  - moze instalowac resource packi, shaderpacki i opcjonalne client-side mody.
  - do filtrowania modow korzystamy z client-side/server-side metadata Modrinth.

- Publiczna strona pobierania:
  - osobna lekka strona statyczna, nie czesc backendu sync;
  - hostuje `.exe` najnowszej wersji;
  - pokazuje SHA;
  - linkuje tez do GitHub Releases.

- Microsoft auth:
  - preferowany kierunek: MSMC;
  - powod: tokenless flow z domyslnym tokenem launchera Minecraft, bez rejestracji wlasnej aplikacji Azure na start.

## Priorytet A - rdzen v2

- Setup wizard przy pierwszym uruchomieniu:
  - wykrywa, czy exe lezy luzem w folderze z innymi plikami;
  - proponuje utworzenie osobnego folderu instancji;
  - przenosi albo inicjalizuje `minecraft/`, `launcher-data/`, `assets/`;
  - blokuje przypadkowe tworzenie plikow obok pobranego exe na pulpicie/pobranych.

- Auto updater launchera:
  - sprawdza GitHub Releases;
  - pokazuje popup przy starcie: `Zaktualizuj` / `Nie teraz`;
  - pobiera nowa wersje tylko po potwierdzeniu gracza;
  - pokazuje changelog;
  - ma fallback: jesli update sie nie uda, stara wersja nadal dziala.

- Logowanie Microsoft:
  - offline/non-premium zostaje jako glowny tryb;
  - premium/Microsoft jako opcjonalny tryb konta;
  - docelowo pelny login w v2, nie eksperymentalny stub;
  - preferowana biblioteka: MSMC;
  - MSMC wspiera flow bez wlasnego Microsoft/Azure client tokena;
  - MCLC nie robi Microsoft auth samodzielnie, tylko przyjmuje gotowy obiekt `authorization` z `meta.type = "msa"`;
  - login trzeba zrobic osobna biblioteka/procesem, a wynik przekazac do MCLC;
  - tokeny trzymane lokalnie, bez wysylania do backendu DwargonMC;
  - UI jasno pokazuje, na jakim typie konta gracz odpala gre.

- Lepszy lifecycle procesu Minecraft:
  - launcher pilnuje procesu MC do konca;
  - `Ostatnio grales` pokazuje ostatni czas sesji albo date zakonczenia gry;
  - ustawienie `zamknij po starcie` zamyka/minimalizuje launcher dopiero po poprawnym starcie MC;
  - powrot launchera po zamknieciu MC, jesli byl schowany.

- Czas gry:
  - launcher mierzy czas aktualnej sesji od poprawnego startu MC do zamkniecia procesu;
  - pokazuje ostatni czas gry w panelu gracza;
  - zapisuje laczny czas gry lokalnie w profilu;
  - opcjonalnie pokazuje liczbe uruchomien gry;
  - bez wysylania statystyk na backend w v2.

- Tray zamiast zwyklego minimalizowania:
  - zamkniecie okna moze chowac do tray;
  - tray ma akcje: pokaz launcher, start gry, otworz folder, wyjdz;
  - trzeba uniknac sytuacji, gdzie user nie wie, ze launcher dalej dziala w tle.

- Usuniecie FOV z ustawien:
  - launcher nie powinien narzucac opcji gry gracza;
  - zostawic tylko ustawienia launchera, Javy, RAM, synca i konta.

- Sprzatanie repo pod release pipeline:
  - jesli auto-update idzie przez GitHub Releases, repo musi byc czytelne przed v2 release;
  - rozdzielic launcher, backend i strone statyczna;
  - uporzadkowac dokumentacje build/release;
  - upewnic sie, ze release artifacts, runtime data i paczki modow nie trafiaja do git.

## Priorytet B - backend i komunikacja

- Wiadomosci/info od admina bezposrednio w launcherze:
  - endpoint read-only typu `GET /announcements.json`;
  - tytul, tresc, poziom waznosci, data, opcjonalny link;
  - launcher cacheuje ostatnie wiadomosci, ale nie blokuje startu gry gdy endpoint padnie;
  - typy: info, warning, maintenance, update;
  - opcjonalne `expiresAt`, zeby stare komunikaty same znikaly.

- Lekka strona backendu dla admina:
  - na v2 najlepiej bardzo prosta, zabezpieczona haslem/tokenem;
  - wysylanie/edycja wiadomosci w pliku JSON;
  - podglad manifestu, tla, health, map proxy;
  - bez pelnego panelu zarzadzania launcherem.

- Publiczna strona pobierania:
  - osobny statyczny frontend poza backendiem Fastify;
  - link do najnowszego launchera;
  - bezposrednio hostowany `.exe` najnowszej wersji;
  - link do GitHub Releases;
  - SHA256 pliku do weryfikacji;
  - status serwera;
  - krotka instrukcja instalacji;
  - changelog;
  - link do mapy i Discorda, jesli beda potrzebne.

- Health/status serwera v2:
  - prawdziwa lista graczy zamiast pustej listy;
  - liczba graczy online/max;
  - ping cykliczny po stronie launchera;
  - jasne rozroznienie: backend online, MC offline, mapa offline.

## Priorytet C - content i wygoda gracza

- Przegladarka resource packow i shaderpackow przez Modrinth API:
  - CurseForge raczej odlozone, bo API jest bardziej problematyczne;
  - wyszukiwanie po `project_type:resourcepack`, `project_type:shader` i opcjonalnie `project_type:mod`;
  - filtrowanie po `versions:1.21.1`;
  - dla modow filtrowanie po loaderze `neoforge` i client-side/server-side metadata Modrinth;
  - sortowanie: relevance, downloads, updated, newest;
  - dla resource packow wersje filtrowac loaderem `minecraft`;
  - instalacja do `minecraft/resourcepacks/`, `minecraft/shaderpacks/` albo `minecraft/mods/`;
  - brak automatycznego usuwania paczek gracza bez wyraznej akcji;
  - launcher wysyla wlasny `User-Agent`, zeby nie ryzykowac blokady API;
  - cache wynikow i ikon lokalnie, zeby nie mielic limitow API przy kazdym kliknieciu.

- Modrinth update checker dla paczek gracza:
  - liczy SHA1/SHA512 lokalnych plikow;
  - sprawdza, czy Modrinth zna plik i czy istnieje nowsza zgodna wersja;
  - pokazuje update jako sugestie, bez automatycznej podmiany;
  - przy paczkach spoza Modrinth pokazuje status `zrodlo nieznane`.

- Opcjonalne presety dodatkow:
  - `Czysto`, `Performance`, `Visual`;
  - resource/shader packs i opcjonalne client-side mody;
  - preset zapisany lokalnie per instancja.

- Zarzadzanie dodatkowymi paczkami gracza:
  - launcher pokazuje pliki zarzadzane przez serwer osobno od plikow gracza;
  - przycisk `otworz resourcepacks`, `otworz shaderpacks`, `otworz mods`;
  - ostrzezenie, gdy mod gracza moze konfliktowac z paczka serwera.

- Reinstall/repair instance v2:
  - oddzielnie: core MC/NeoForge, assety, biblioteki, sync modow;
  - widoczny opis co zostanie usuniete;
  - nigdy nie usuwa save'ow, screenshotow, resource packow gracza bez potwierdzenia.

- Preflight diagnostics przed startem gry:
  - Java path i wersja;
  - RAM przydzielony vs RAM systemu;
  - wykrycie GPU/OpenGL w logach po crashu;
  - ostrzezenie, gdy launcher dziala w VM albo bez akceleracji 3D.

- Java fallback:
  - launcher najpierw wykrywa Java 21+ z PATH albo recznej sciezki;
  - jesli Java nie zostanie wykryta, pokazuje popup z opcja pobrania instalatora Java;
  - preferowany edge-case flow: instalator Oracle JDK/JRE, bo standardowo potrafi dodac Java do PATH;
  - po instalacji przycisk `Sprawdz ponownie`;
  - bez cichej instalacji i bez modyfikowania PATH przez launcher;
  - nadal zostaje opcja recznego wskazania `java.exe`.

- Eksport diagnostyki lokalnie:
  - zip z ostatnimi logami launchera, logami MC, ustawieniami bez sekretow;
  - bez uploadu na backend;
  - przydatne do wyslania adminowi albo wklejenia do AI.

## Priorytet D - UI polish

- Generalny polish UI:
  - skalowanie zawartosci przy zmianie rozmiaru okna;
  - lepsze popupy ustawien, logow, mapy i listy graczy;
  - dopracowane stany empty/loading/error;
  - brak przesuwania layoutu przy dlugich tekstach;
  - pelna obsluga malego okna i 1080p.

- Mapa:
  - poprawny fullscreen/restore;
  - karta mapy niewidoczna, gdy proxy mapy nie odpowiada;
  - osobny status mapy, nie tylko status backendu.

- Logi:
  - filtrowanie: launcher, sync, Java/Minecraft, error;
  - kopiuj ostatnie 100/300 linii;
  - autoscroll zostaje jako toggle;
  - crash modal korzysta z tego samego bufora.

- Lekka customizacja/reusable pod inne serwery:
  - nazwa serwera, domeny, IP, kolory, tla, logo z jednego configu;
  - bez robienia z tego pelnego white-label SaaS;
  - v2 ma miec bundlowany config brandingu na etapie builda.

- Dostepnosc i ergonomia:
  - skroty klawiszowe dla popupow i zamykania;
  - teksty przyciskow mieszcza sie w malej szerokosci;
  - wyrazne focus states dla inputow i przyciskow.

## Techniczne tematy do rozstrzygniecia

- Mechanizm auto-update:
  - decyzja: GitHub Releases;
  - sprzatanie repo i release pipeline wchodzi do Priorytetu A;
  - backend endpoint odrzucony na v2, bo doklada utrzymanie;
  - trzeba zdecydowac, czy update ma dotyczyc tylko `.exe`, czy tez `win-unpacked`;
  - decyzja UX: update sugerowany popupem, nie wymagany.

- Microsoft auth:
  - MCLC `Authenticator` nie obsluguje Microsoft authentication;
  - MCLC moze uruchomic gre z gotowym `authorization` object, w tym `meta.type = "msa"`;
  - preferowany wybor na start: MSMC;
  - MSMC moze uzyc domyslnego tokena launchera Minecraft, wiec nie trzeba od razu rejestrowac wlasnej aplikacji OAuth;
  - wynik z MSMC mozna przekazac do MCLC przez `token.mclc()`;
  - tokeny/refresh tokeny lokalnie, najlepiej przez bezpieczny storage OS, jesli da sie to zrobic bez duzego narzutu.

- Bezpieczenstwo backendu admina:
  - read-only endpointy moga zostac publiczne;
  - zapis wiadomosci musi miec auth;
  - nie trzymac tokenow Microsoft graczy na backendzie.

- Format wiadomosci/admin content:
  - JSON plik na v2;
  - baza dopiero, gdy dojdzie historia, role, panel albo statystyki.

- Dane lokalne:
  - utrzymac zasade portable obok exe;
  - wizard ma zapobiec balaganowi w przypadkowym folderze;
  - nadal nie ruszac plikow gracza bez `_` / bez jasnej akcji.

- Java distribution:
  - v2 nie musi bundlowac Javy;
  - fallback installer jest tylko dla przypadkow, gdzie gracz nie ma Java 21+;
  - przed implementacja sprawdzic aktualny, legalny i stabilny link do instalatora Oracle albo wybrac alternatywe typu Adoptium.

- Modrinth API:
  - wiekszosc publicznych odczytow nie wymaga tokena;
  - trzeba ustawic unikalny `User-Agent`;
  - uwzglednic rate limit i cache;
  - trzymac Modrinth integration po stronie launchera, bez proxy backendu, dopoki nie ma potrzeby;
  - instalacja modow wymaga filtrowania po MC `1.21.1`, loaderze `neoforge` i client-side/server-side metadata.

## Poza v2 / backlog pozniej

- Przeorganizowanie i posprzatanie root projektu, jesli auto-update nie bedzie oparty o GitHub Releases.
- Pelny panel admina.
- Statystyki graczy.
- Upload logow/crashy na backend.
- Integracje Discord/AI.
- Linux build.
- CurseForge API, jesli bedzie sens ubiegac sie o dostep developerski.
- Sygnowanie manifestu i mocniejszy security model synca.

## Pytania techniczne do doprecyzowania przy implementacji

- Czy auto-update pobiera tylko `.exe`, czy obslugujemy tez `win-unpacked` jako fallback?
- Jakim narzedziem robimy bezpieczny lokalny storage dla tokenow MSMC?
- Czy statyczna strona pobierania ma byc deployowana z GitHub Actions automatycznie?
