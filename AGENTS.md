# Wersje i publikacja

- Numer wydania jest w `version.json`. Ten sam numer musi być widoczny w nagłówku strony i w metadanych `index.html`.
- Numer obecnego wydania odczytaj z version.json. Przy każdej kolejnej opublikowanej aktualizacji uruchom `./Update-Version.ps1` bez argumentów dokładnie raz, po zakończeniu zmian. Skrypt zwiększa drugi człon numeru wydania o jeden.
- Każda publikowana wersja musi mieć nowy wpis w historii zmian w `index.html`, z tym samym numerem co `version.json`. Najnowszy wpis oznacz jako „teraz” i usuń to oznaczenie ze starszego wpisu.
- Razem z plikami głównymi publikuj również `liga-angielska.js`, `liga-angielska.css` oraz `liga-social.js` i `liga-rankings.js`, a od 0.50 również `liga-platform.js`, `liga-platform.css`, `liga-hiszpanska-data.js`, `liga-hiszpanska.js` i `liga-arena.js`, a od 0.51 także `liga-zdania.js`. Migracje bazy wdrażaj do istniejącego projektu Supabase przed publikacją funkcji, które z nich korzystają.
- Nie zwiększaj wersji przy samej analizie, zmianach roboczych ani ponowieniu nieudanego wysłania tego samego wydania. Przy świadomym ustawieniu numeru użyj parametru `-Version`.
- Do repozytorium publikacyjnego przenieś razem `index.html`, `ortoliga-core.js`, `ortoliga.js`, `ortoliga.css`, `version.json`, `Update-Version.ps1`, `URUCHOMIENIE-SYNC.md`, `supabase/config.toml`, `supabase/functions` i `supabase/migrations` oraz ten plik. Zmiany funkcji Edge wdrażaj do projektu Supabase zgodnie z dokumentacją. Jeśli istnieje `.publish-stage`, to obecny klon służący do publikacji.
- Użytkownik upoważnił do publikowania gotowych aktualizacji w istniejącym repozytorium GitHub Pages.
- Użytkownik zatwierdził nazwę aplikacji EduLiga. OrtoLiga pozostaje nazwą ligi ortograficznej.
- Od 0.52 główna publikacja jest w repozytorium `czasowstrzymywacz-a11y/eduliga`, klon `.eduliga-stage`. `.publish-stage` obsługuje stary adres `/ortoliga/` i publikuje przekierowanie do `/eduliga/`. Zawsze najpierw opublikuj i potwierdź nowy adres, potem stary.
- Publikuj również `eduliga-ui.js`, `eduliga-logo.svg` i `ortoliga-redirect.html`. W starym klonie po skopiowaniu plików zastąp `index.html` szablonem `ortoliga-redirect.html`, podmieniając `__EDULIGA_VERSION__` na numer z `version.json`. Nie zwiększaj ponownie numeru wydania dla przekierowania.


- Od 0.56 publikuj również pliki flag: eduliga-flag-en.svg i eduliga-flag-es.svg.
- Od 0.57 publikuj także eduliga-flag-pl.svg.
- Od 0.62 publikuj również eduliga-community.js i eduliga-experience.js.
- Od 0.63 publikuj również eduliga-topics.js i liga-pomocnika.js.
- Od 0.65 publikuj również eduliga-ocr.js.
- Od 0.66 publikuj również eduliga-hosting.js. Główny adres użytkowników to https://eduliga.web.app/ w projekcie Firebase `eduliga`, witryna Hosting `eduliga`, bezpłatny plan Spark. Kod i kopia aplikacji pozostają w repozytorium GitHub `eduliga`; publikację Firebase wykonuj przez `.firebase-hosting/Deploy-Hosting.ps1` po przygotowaniu wersji i historii. Potwierdź nowy adres przed aktualizacją starych. Stary `/eduliga/` zachowuje pełną aplikację dla lokalnych wyników i powrotów logowania; `eduliga-hosting.js` kieruje nowych użytkowników do Firebase, a osoby z lokalną sesją lub postępami mogą przejść po zabezpieczeniu wyników. Nigdy nie przekazuj tokenów sesji między domenami. `.publish-stage` nadal kieruje `/ortoliga/` do `/eduliga/`, gdzie działa ta ochrona.

- Od 0.70 publikuj również eduliga-tenses.js i eduliga-suggestions.js. Migracja 202610170004_suggestions_and_tenses.sql musi być wdrożona przed publikacją.

- Od 0.76 publikuj również eduliga-english-lesson.js. Migracja 202610190001_english_lesson.sql dopuszcza zaproszenia do nowego działu.

- Od 0.80 publikuj również eduliga-guests.js. Przed publikacją wdroż migrację 202610190002_guest_activity.sql. Statystyki gości są anonimowe i opcjonalne; panel odczytu jest tylko dla administratorów czatu.

- Od 0.82 publikuj również eduliga-push.js i eduliga-push-sw.js. Przed publikacją wdroż migrację 202610190003_admin_push.sql oraz funkcję Edge admin-push. Funkcja weryfikuje sesję po stronie serwera; klucz prywatny Web Push pozostaje wyłącznie w tabeli serwera, bez dostępu użytkowników. Administrator włącza zgodę na każdym telefonie osobno.

- Od 0.83 publikuj również eduliga-access.js i eduliga-diagnostics.js. Przed publikacją wdroż migrację 202610190004_diagnostics.sql. Diagnostyka przyjmuje wyłącznie zamknięty zestaw kodów zdarzeń; panel odczytu sprawdza is_chat_admin. Nigdy nie dodawaj do telemetrii haseł, tokenów, e-maili, wpisanych odpowiedzi ani treści rozmów.

- Od 0.84 publikuj również eduliga-members.js. Przed publikacją wdroż migracje 202610200001_member_activity.sql i 202610200002_push_delivery.sql oraz aktualizację funkcji admin-push. Statystyki zalogowanych odczytują wyłącznie administratorzy; zapis sesji przypisuje konto przez auth.uid(), nigdy przez identyfikator przesłany przez klienta. Nie publikuj endpointów subskrypcji, kluczy Web Push ani e-maili w raportach.

- Od 0.85 przed publikacją wdroż migrację 202610200003_battle_rooms.sql. Bitwy używają uwierzytelnionych RPC do synchronizacji składu pokoju i krótkotrwałych pakietów gry. Identyfikator konta wyłącznie z auth.uid(); bez bezpośredniego dostępu klienta do tabel. Lista otwartych bitew jest w zakładce bitew czatu.

- Od 0.86 przed publikacją wdroż migrację 202610200004_helper_photos.sql. Wiele zdjęć Pomocnika jest w helper_attachments, zapisywanych przez helper_post_images i helper_add_images. Dodatkowe zdjęcia dołącza wyłącznie autor wpisu; za dołączenie zdjęć nie przyznawaj ponownie pXP. Zachowaj obsługę wcześniejszych image_path i zasady widoczności usuniętych wpisów.

- Od 0.87 przed publikacją wdroż 202610200005_helper_needs.sql. Dołączenie do pytania Pomocnika nie daje pXP; helper_support wiąże użytkownika przez auth.uid(), a get_helper_needs zwraca tylko licznik i własny stan. Wspólny dobór powtórek EduPractice jest w liga-platform.js, używany w treningach obu języków.
