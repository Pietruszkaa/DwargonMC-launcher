# Changelog v2

## Launcher

- Dodano tryb konta non-premium first z opcjonalnym logowaniem Microsoft.
- Dodano popup startowy z wyborem trybu konta.
- Dodano sprawdzanie aktualizacji przez GitHub Releases z popupem "Zaktualizuj" / "Nie teraz".
- Dodano synchronizowanie wersji launchera z tagiem release.
- Dodano tray oraz wybór zachowania przy zamykaniu okna: pytaj, schowaj do tray albo zamknij launcher.
- Dodano licznik ostatniej sesji oraz lacznego czasu gry.
- Dodano lekki preflight Java / backend / pliki gry.
- Dodano pomocnik Java 21: pobranie instalatora Windows albo otwarcie strony Oracle.
- Dodano edycje wybranych ustawien `options.txt` Minecrafta z poziomu launchera.
- Dodano blokade zapisu ustawien MC podczas dzialania gry, zeby Minecraft nie nadpisal zmian przy zamknieciu.
- Dodano przycisk kopiowania logu po crashu.

## UI

- Przebudowano glowny ekran pod layout v2: topbar, sidebar, mapa, lista graczy, logi i dolne akcje.
- Mapa jest ukrywana, gdy proxy mapy nie odpowiada.
- Tla z backendu przechodza plynnie i nie znikaja po syncu.
- Ustawienia launchera zostaly przeniesione do widoku roboczego z kategoriami.
- Sekcja Modrinth i lista zainstalowanych dodatkow dzialaja w popupie ze scrollowaniem.
- Poprawiono skalowanie i polskie teksty UI.

## Sync I Backend

- Sync server dziala jako read-only backend z manifestem, plikami, tlami, mapa, health i komunikatami.
- Manifest poprawnie obsluguje pliki synca oraz tla.
- Dodano ping serwera MC cyklicznie, nie tylko przy starcie launchera.
- Dodano proxy mapy z konfigurowalnym portem.

## Modrinth

- Dodano przegladarke Modrinth z wynikami ladowanymi od razu i doczytywaniem przez scroll.
- Dodano instalowanie opcjonalnych modow client-side, shaderow i resource packow.
- Dodano wykrywanie dodatkow zainstalowanych przez launcher oraz dodatkow z synca.
- Dodatki serwerowe z synca sa chronione przed usunieciem.
- Dodatki uzytkownika mozna usuwac z poziomu launchera.
- Ograniczono zapytania przy weryfikacji dodatkow, zeby nie wpadac w rate limit Modrinth.

## Znane Ograniczenia

- Automatyczny updater v2 pobiera plik release; pelny updater aplikacji zostaje na v3.
- Java 21 jest zalecana, ale nie wymuszana.
- Automatyczne pobranie instalatora Java jest przygotowane glownie pod Windows.
- Edycja ustawien MC wymaga zamknietej gry i dziala od nastepnego uruchomienia Minecrafta.
