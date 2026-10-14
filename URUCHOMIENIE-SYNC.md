# Uruchomienie OrtoLigi: konta e-mail, synchronizacja i publikacja

Aplikacja może działać jako strona internetowa bez kupowania domeny. GitHub Pages publikuje stronę z repozytorium, a Supabase przechowuje konta, prywatne postępy uczniów i dane rankingów.

## Repozytorium i strona

Repozytorium projektu: <https://github.com/czasowstrzymywacz-a11y/ortoliga>.
Adres strony: <https://czasowstrzymywacz-a11y.github.io/ortoliga/>.
Po skonfigurowaniu repozytorium aktualizacje wysyła się z folderu projektu:

```powershell
git add -A
git commit -m "Opis zmian"
git push
```

W GitHub wybierz **Settings → Pages → Deploy from a branch**, gałąź `main`, folder `/ (root)`. Nie publikuj kluczy `service_role`/Secret, hasła do bazy ani plików `.env`. Klucz publishable/anon w kodzie przeglądarki jest publiczny; dostęp do danych kontrolują zasady RLS.

## Supabase — konfiguracja e-mail

1. W projekcie Supabase powiązanym ze stroną otwórz **Authentication → URL Configuration**.
2. Ustaw **Site URL** na `https://czasowstrzymywacz-a11y.github.io/ortoliga/`.
3. Dodaj ten sam adres do **Redirect URLs** (w razie potrzeby także `https://czasowstrzymywacz-a11y.github.io/ortoliga/**`).
4. W **Authentication → Providers → Email** włącz Email. Potwierdzanie adresów może pozostać włączone: uczeń kliknie link w skrzynce, a potem zaloguje się tym samym adresem lub swoim pseudonimem i hasłem. Dodaj adres strony do dozwolonych adresów powrotu, aby działały potwierdzanie e-maila i reset hasła.
5. Otwórz **SQL Editor**, wklej zawartość `supabase-sync.sql` i wybierz **Run**. Skrypt bezpiecznie tworzy tabele, zasady dostępu, profil rankingowy i funkcję rankingu. Można go uruchamiać ponownie po aktualizacjach.
6. W `index.html` sprawdź `window.ISKIERKA_SYNC_CONFIG`: adres projektu i klucz publishable/anon muszą należeć do tego samego projektu Supabase, w którym uruchomiono SQL.

Supabase Auth obsługuje tworzenie kont, logowanie e-mailem i reset hasła. Logowanie pseudonimem obsługuje funkcja Edge `student-auth`; jej kod znajduje się w `supabase/functions/student-auth/index.ts`. Po zmianie tego kodu wdrażaj ją do projektu `kubuighspmtztyxdgwxd` poleceniem `supabase functions deploy student-auth --project-ref kubuighspmtztyxdgwxd`. Funkcja wymaga skonfigurowanych sekretów Supabase oraz tabeli profili z `supabase-sync.sql`. Nie wpisuj kluczy administracyjnych do aplikacji ani repozytorium.

## Konta i rankingi

Uczeń zakłada konto adresem e-mail i hasłem (co najmniej 8 znaków) oraz wybiera imię lub pseudonim 2–24 znaków. Tylko ten pseudonim jest pokazany w rankingach. Jeśli włączone jest potwierdzenie adresu, najpierw trzeba kliknąć link otrzymany e-mailem, a następnie zalogować się.

Po zalogowaniu aplikacja tworzy profil rankingowy i synchronizuje postępy między urządzeniami. Pierwsze logowanie nowego konta przenosi zapis z bieżącej przeglądarki. Rankingi pokazują sześć kategorii równocześnie; odczyt publicznych zestawień obsługuje funkcja SQL `get_leaderboard`, a dane uczniów chronią polityki RLS.

Uczniowie, którzy wcześniej korzystali z kont PIN, muszą utworzyć konto e-mail. Stare postępy pozostają na starym koncie PIN i nie są automatycznie łączone z nowym adresem.

### Lista zawodników i dostępność

Nowa wersja dodaje do Rankingi listę kont z pseudonimem oraz zieloną kropką przy osobach aktywnych. Aby ją włączyć w istniejącym projekcie, w Supabase otwórz **SQL Editor**, uruchom plik `supabase/migrations/202610060001_student_roster.sql`, a następnie odśwież aplikację. Funkcja udostępnia wyłącznie identyfikator konta i pseudonim zalogowanym uczniom; status aktywności jest chwilowy i przekazywany kanałem Realtime, nie jest zapisywany w historii.

W aplikacji użytkownik może też wybrać tryb nocny przyciskiem w górnym pasku. Ustawienie zapamiętuje się na danym urządzeniu.


## Wspólny czat uczniów

Wersja 0.13 dodaje pseudonimowy czat widoczny dla zalogowanych uczniów. W istniejącym projekcie Supabase otwórz SQL Editor i uruchom jednorazowo supabase/migrations/202610070001_class_chat.sql. Migracja tworzy prywatną tabelę, ogranicza odczyt i wysyłanie do zalogowanych kont, ustawia pseudonim z profilu, ogranicza długość i częstotliwość wpisów oraz blokuje publikowanie danych kontaktowych i odnośników. Po uruchomieniu odśwież aplikację. supabase-sync.sql zawiera również tę migrację dla nowych instalacji.

## Liga Angielska i bitwy

Wersja 0.27 dodaje wybór ligi na ekranie startowym oraz moduł nauki dwóch form czasowników nieregularnych z widocznej części dołączonej tabeli. Statystyki i XP zapisują się w danych postępu ucznia (`student_progress`) oraz lokalnej kopii dla konta. Nie wymaga to dodatkowej migracji.

Bitwy korzystają z kanałów Supabase Realtime i wymagają zalogowanych kont z włączoną usługą Realtime. Pokoje są tymczasowe, a kod pokoju trzeba przekazać drugiemu uczniowi. Obecny moduł ćwiczy 21 czasowników widocznych na zdjęciu; dalsze pozycje można dodać do `liga-angielska.js`.
## XP na liście i zaproszenia do bitwy (0.45)

Uruchom `supabase/migrations/202610130001_english_invitations.sql` w SQL Editor istniejącego projektu przed publikacją strony. Funkcja listy ujawnia zalogowanym wyłącznie pseudonim, identyfikator i łączne XP Ligi Angielskiej. Zaproszenia mogą czytać tylko nadawca i adresat; odpowiedź zapisuje wyłącznie adresat. Zaproszenia wygasają po 2 minutach, a wysyłanie ma ograniczenie częstotliwości. Powiadomienia działają przez Realtime i zapasowe odświeżanie co 10 sekund. Wszyscy dołączają do jednego stałego pokoju `liga-angielska-open-room`; nie ma kodów pokoi.

## Rankingi obu lig (0.47)

Przed publikacją wdroż migrację `supabase/migrations/202610130002_league_rankings.sql`. Funkcja udostępnia zalogowanym tylko pseudonimy i zbiorcze statystyki nauki; nie udostępnia adresów e-mail ani historii odpowiedzi. XPo to suma zaokrąglonych wyników dyktand (0–100), XP pochodzi wyłącznie z Ligi Angielskiej. Średnia ortograficzna wymaga 3 dyktand, skuteczność angielska 10 odpowiedzi. Do plików publikacji dołącz `liga-rankings.js`.

## Wydanie 0.50 — trzy osobne ligi

Wdróż migrację `supabase/migrations/202610130003_three_leagues.sql` przed publikacją. OrtoLiga zachowuje wcześniejsze dyktanda i zdobywa oXP; angielska zachowuje `englishLeague` i ma aXP, a `spanishLeague` przechowuje wyłącznie hXP, fiszki, pary, pisownię i bitwy hiszpańskie. `orthoBattle` przechowuje oddzielną historię bitew ortograficznych. Nowe zdarzenia mają unikalne identyfikatory; synchronizacja scala je bez powielania punktów. Punkty angielskie także mają rejestr nowych zdarzeń i zachowany początkowy wynik. Rankingi i listy użytkowników pobierają tylko pseudonimy i zbiorcze statystyki. Bitwy używają trzech oddzielnych kanałów `liga-v050-ortho`, `liga-v050-english`, `liga-v050-spanish`, mają 10 rund i wymagają minimum 2 zalogowanych graczy. Wymowa korzysta z głosów przeglądarki/urządzenia z językiem es-ES. Publikuj także `liga-platform.js`, `liga-platform.css`, `liga-hiszpanska-data.js`, `liga-hiszpanska.js` i `liga-arena.js`.

## Profile, menu i rozsypanki (0.51)

Wdróż migrację `supabase/migrations/202610130004_missing_profiles.sql`. Uzupełnia brakujące profile nazwanych kont i automatycznie tworzy je przy założeniu konta lub uzupełnieniu pseudonimu. Zachowuje istniejące profile i wyniki; kont anonimowych nie publikuje. Do publikacji dołącz `liga-zdania.js`: rozsypanki hiszpańskie mają minimum 3 wyrazy, nagrodę +10 hXP i karę −5 hXP. Na telefonie wspólny czat jest stale umieszczony na dole, a rankingi mają oddzielne kafelki kategorii.

## EduLiga i dwa adresy (0.52)

Główna aplikacja: https://czasowstrzymywacz-a11y.github.io/eduliga/. Repozytorium `czasowstrzymywacz-a11y/eduliga` i klon `.eduliga-stage` zachowują historię wcześniejszego projektu. Stary adres `/ortoliga/` ma osobny klon `.publish-stage` i przekierowuje do `/eduliga/`. Najpierw opublikuj pełną aplikację w nowym repozytorium, potem w starym repozytorium zastąp `index.html` szablonem `ortoliga-redirect.html`, zamieniając `__EDULIGA_VERSION__` na aktualny numer. Przekierowanie zachowuje parametry i fragment adresu, w tym powroty z potwierdzenia konta i odzyskiwania hasła. Oba adresy są w tej samej domenie, więc dotychczasowe klucze pamięci kont/gościa i sesji Supabase nie zmieniają się. W Supabase Auth URL Configuration nowy Site URL to `/eduliga/`; lista dozwolonych URL zawiera zarówno `/eduliga/`, jak i wcześniejsze adresy. W obu repozytoriach publikuj też logo `eduliga-logo.svg`, `eduliga-ui.js` i szablon przekierowania.

## Historia zdobytych punktów (0.54)

Przed publikacją wdroż migrację supabase/migrations/202610130005_point_history.sql. Odczyt wymaga zalogowania i zwraca maksymalnie 30 ostatnich dodatnich nagród wskazanego profilu w wybranej lidze: liczbę punktów, kategorię, datę i godzinę. Nie zwraca odpowiedzi ani całego postępu. Nowe angielskie zdarzenia punktowe zapisują czas i kategorię; starsze bez czasu są oznaczone jako starszy zapis. Dyktanda bez godziny pokazują samą zachowaną datę. Kliknięcie pseudonimu lub punktów w liście otwiera historię z przełączaniem ligi. Historia pokazuje zdobyte punkty; kary pozostają uwzględnione w sumach rankingowych.

## Dzwonek i bitwy wieloosobowe (0.59)

Zaproszenia angielskie nadal korzystają z istniejącej tabeli english_battle_invitations i funkcji RPC z migracji 202610130001. Odbiorca ma stały dzwonek z licznikiem; na telefonie znajduje się obok czatu. Realtime uzupełnia odczyt co 4 sekundy oraz po powrocie do aplikacji. Błędy pobierania są widoczne w skrzynce. Wysłanie wymaga potwierdzenia identyfikatora zaproszenia z serwera i wejścia nadawcy do pokoju.

W trzech ligach lista zawodników bieżącej rundy dopuszcza nowych obecnych graczy, jeśli do wspólnego końca rundy zostało ponad 5 sekund; w ostatnich sekundach osoba czeka w pokoju na kolejną rundę. Czas odpowiedzi nowego gracza liczy się od udostępnienia mu pytania. Każda bitwa ma nadal 10 rund i osobne punkty. Numer rewizji stanu chroni przed spóźnionymi starszymi wiadomościami, a zapytania o stan co 4 sekundy pozwalają odzyskać pominięty komunikat. Wszyscy uczestnicy powinni otworzyć najnowszą wersję strony.

## Zapraszanie w Bitwie każdej ligi (0.60)

Wdróż supabase/migrations/202610140001_all_league_invitations.sql przed publikacją. Istniejąca tabela zaproszeń otrzymuje pole league; polityki dostępu nadal dopuszczają wyłącznie uczestników zaproszenia. Nowe RPC send_league_battle_invitation i get_league_battle_invitations obsługują trzy ligi. Starsze angielskie zaproszenia zachowują ligę english, a wcześniejszy odczyt RPC zwraca tylko angielskie zaproszenia. Odpowiedź korzysta z dotychczasowej funkcji respond_english_battle_invitation i sprawdza tożsamość odbiorcy.

Przycisk Zaproś istnieje tylko w panelu Bitwa każdej ligi, przed i po wejściu do pokoju. Lista pokazuje obecnych w kanale aktywności użytkowników, z pominięciem zapraszającego. Kliknięcie wchodzi do pokoju wybranej ligi i zapisuje zaproszenie; odbiorca widzi nazwę ligi przy dzwonku i po przyjęciu trafia do tego samego pokoju. Ogólne listy użytkowników zachowują wyłącznie dostęp do historii punktów.

## Czat w ikonce i moderacja (0.61)

Przed publikacją wdrażaj supabase/migrations/202610140002_chat_moderation.sql. Role moderacji czatu są przypisane do zweryfikowanych identyfikatorów istniejących kont Filipa i Dominika. Zmiana pseudonimu nie nadaje uprawnień. Tabele class_chat_admins oraz class_chat_removed_text mają RLS i nie są udostępnione klientom. Funkcja is_chat_admin zwraca tylko status bieżącego konta; moderate_class_chat_message sprawdza rolę przy każdym wywołaniu.

Usuwanie jest odwracalne: oryginalny tekst trafia do prywatnego archiwum, a publiczny wpis otrzymuje znacznik usunięcia i neutralną treść. Zwykły użytkownik nie widzi usuniętego wpisu; administrator ma przy nim Cofnij. Archiwum zachowuje treść do przywrócenia i nie jest odczytywane z aplikacji. Zmiany UPDATE odbierane są przez Realtime, a rozwinięty czat ma też odświeżanie zapasowe co 12 sekund. Nie wykonywano usunięcia żadnej istniejącej wiadomości podczas wdrożenia.

Wspólny element czatu jest przeniesiony poza panel boczny i otwierany tą samą dolną ikonką na telefonie i komputerze. Bieżący szkic wiadomości pozostaje w tym samym polu.

## Rozmowy, powiadomienia i bitwy (0.62)

Migracja `supabase/migrations/202610140003_private_chat.sql` została wdrożona do istniejącego projektu. Wiadomości prywatne są zapisane na serwerze również dla odbiorcy offline. RLS pozwala na odczyt tylko nadawcy i odbiorcy; wysyłanie i oznaczanie odczytu odbywa się przez RPC sprawdzające konto. Lista rozmów używa wszystkich profili, a nie tylko obecności online. Moderacja czatu wspólnego nie daje dostępu do cudzych rozmów prywatnych.

`eduliga-community.js` łączy czat wspólny, rozmowy prywatne i zaproszenia w jednej ikonce. Realtime uzupełnia odświeżanie co 5 sekund. Zaproszenia w rozmowie nadal korzystają z istniejących RPC i wygasają po dwóch minutach. Wibracja używa API przeglądarki; nie każda przeglądarka telefonu ją obsługuje.

Bitwy korzystają z kanałów `liga-v062-{league}`. Wszyscy gracze muszą odświeżyć stronę po aktualizacji. Każda runda ma 30 sekund; „Nie wiem” i brak odpowiedzi odejmują 5 punktów za rundę. Nowy gracz dołącza do bieżącego pytania, jeśli zostało ponad 5 sekund. Host synchronizuje czas, stan, wyniki i przejęcie pokoju. Jest to protokół z gospodarzem w przeglądarce, nie serwerowy system przeciwdziałania oszustwom.

`eduliga-experience.js` dodaje animacje poprawnych odpowiedzi, krótkie instrukcje i wykres dziennych punktów w Moich słowach. Szanuje ograniczenie ruchu w systemie. Zdarzenia punktowe angielskie zawierają metadane odpowiedzi, co pozwala uniknąć ich podwójnego zliczenia podczas łączenia postępu z kilku urządzeń.

Sprawdzenia lokalne: `node tests/source-checks.mjs` i `node tests/learning-checks.mjs`. Test SQL `tests/private-chat-checks.sql` działa w transakcji kończonej ROLLBACK. Plików testowych, serwera podglądu ani jego fikcyjnych graczy nie publikujemy.
