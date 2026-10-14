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
