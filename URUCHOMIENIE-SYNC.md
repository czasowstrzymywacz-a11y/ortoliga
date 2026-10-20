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
2. Ustaw **Site URL** na `https://eduliga.web.app/`. Zachowaj stare adresy GitHub Pages na liście dozwolonych powrotów logowania i dodaj dokładnie `https://eduliga.web.app/`.
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

## Działy materiału i Liga Pomocnika (0.63)

Przed publikacją wdroż `supabase/migrations/202610160001_helper_and_topics.sql`. Nowa liga ma osobne tabele pytań, odpowiedzi i punktów przyznawanych przez serwer. Pytanie i odpowiedź mogą zawierać jedno zdjęcie: plik jest skalowany do 1800 px i zapisywany jako JPEG bez metadanych aparatu. Prywatny zasobnik `helper-images` dopuszcza odczyt zalogowanych uczniów; linki podpisane wygasają po 5 minutach. Formularz pozwala wybrać zdjęcie lub użyć aparatu urządzenia. Nie ma dostępu gościa do forum ani obrazów.

Za pierwszą odpowiedź w cudzym pytaniu przysługuje 5 pXP, najwyżej w 10 pytaniach dziennie. Gdy autor wybierze przydatną odpowiedź, jej autor otrzymuje 15 pXP. Własne pytania i odpowiedzi nie przynoszą punktów, jedno pytanie ma jedno podziękowanie. Klient nie może sam dopisywać punktów. Wpisy mają ograniczenie długości i odstęp 15 sekund. Widok pytań ładuje 150 najnowszych wpisów, odpowiedzi w wątku do 250; odświeża się co 30 sekund lub na żądanie.

`eduliga-topics.js`: angielski część 1 be–feel (identyfikatory 0–20 zachowane), część 2 fight–lose (21–39), fiszki PL / 1. forma / 2. forma z głosem en-GB. Learn dopuszcza learnt i learned. Nadal ćwiczymy tylko dwie formy. Wybór działu steruje treningiem, tabelą słów i pulą bitew; punkty pozostają wspólne w danej lidze. Hiszpański: dział „Poznajmy się — powitania, szkoła i zainteresowania”, cała dotychczasowa baza 65 słów i zwrotów. Przycisk Zmień dział wraca do kafelków.

Kanały bitew `liga-v063-{league}-{topic}` rozdzielają działy. Zaproszenia używają nowych funkcji `send_topic_battle_invitation` / `get_topic_battle_invitations` i przyjmując je wybieramy dział nadawcy. Wszyscy gracze muszą odświeżyć stronę. `get_league_roster_v63` dodaje pXP do list użytkowników i sumy punktów. Ranking i historia pomocnika bazują bezpośrednio na tabelach serwera, nie na lokalnym postępie.

## Moderacja Ligi Pomocnika i prostszy formularz (0.64)

Przed publikacją wdroż `supabase/migrations/202610160002_helper_moderation.sql`. Role administratorów korzystają z istniejącej listy zweryfikowanych kont Filipa i Dominika (`is_chat_admin`). Funkcja `moderate_helper_entry` sprawdza uprawnienia na serwerze. Usunięcie oznacza ukrycie, z opcją przywrócenia. Ukryte pytanie ukrywa też odpowiedzi; ukryte wpisy i ich zdjęcia nie są odczytywane przez pozostałych uczniów. Administrator nadal może odczytać je, aby cofnąć usunięcie. Wcześniej wystawione podpisane adresy zdjęć wygasają najpóźniej po 5 minutach. Historycznie przyznane pXP pozostają zachowane.

Formularz pytania zawiera przedmiot (także język niemiecki), datę lekcji, opis i opcjonalne zdjęcie. Tytuł kafelka tworzy serwer z pierwszych 100 znaków opisu. Pole tytułu pozostaje w bazie dla zgodności wcześniejszych wpisów, ale nie występuje w formularzu.

Za każdą wysłaną odpowiedź w cudzym pytaniu przysługuje 5 pXP, najwyżej za 10 odpowiedzi dziennie. Nie trzeba czekać na zatwierdzenie. Osobne 15 pXP przyznaje autor pytania wybierając pomocną odpowiedź. Zdarzenia nowych odpowiedzi mają reply_id i są przypisane do konkretnego wpisu; wcześniejsze nagrody pozostają zachowane. Własne pytania i odpowiedzi nadal nie dają punktów. Po wysłaniu aplikacja pokazuje, czy przyznano nagrodę.

## Lokalny odczyt zdjęć i potwierdzanie zapisu (0.65)

`eduliga-ocr.js` zastępuje automatyczne uruchamianie starego OCR widokiem kadrowania i weryfikacji. Zdjęcia i tekst rozpoznawane są lokalnie przez Tesseract.js; pobierane są jedynie biblioteki i polski model. Nie wysyłamy zdjęć do dodatkowej usługi. Obrót 90°, wyrównanie wierszy do 12° i suwaki przycięcia pozwalają odciąć tło. Skalowanie do maksymalnie 3200 px, do 2× dla małych wycinków. Opcjonalna normalizacja jasności lokalnego tła zachowuje odcienie szarości, bez twardego progowania mogącego usuwać polskie znaki. Aparat otrzymuje prośbę o wyższą rozdzielczość, zależnie od możliwości urządzenia.

Dwa warianty OCR: przetworzony blok wierszy oraz oryginalny kadr o luźnym układzie; jawny wynik blocks służy do wskazania słów o niskiej pewności. Wynik jest sugestią, bez dostępu do wzorca dyktanda i bez korekty pisowni. Użytkownik porównuje edytowalny tekst ze zdjęciem i zaznacza potwierdzenie przed przekazaniem do istniejącej oceny. Edycja tekstu lub kadru unieważnia potwierdzenie. Ponowny odczyt i przełączenie wariantu pytają przed nadpisaniem poprawek. Przerwanie zamyka worker; spóźnione wyniki ignorowane są przez numer operacji. Wyjście z aparatu i zmiana konta czyszczą odczyt. Bloczkowy wybór pozostaje dostępny.

Ograniczenie: Tesseract jest silnikiem głównie do druku. Ta wersja poprawia przygotowanie zdjęcia i przepływ zatwierdzania, nie gwarantuje automatycznego odczytu niewyraźnego pisma odręcznego. Skreślenia wymagają ręcznej kontroli. Nie przyznajemy wyników automatycznie na podstawie niepotwierdzonego OCR.

## Firebase Hosting — od 0.66

Adres główny: https://eduliga.web.app/. Projekt Firebase i site ID: eduliga, plan Spark. Pliki aplikacji i historia źródeł nadal pozostają na GitHubie. Aktualizacja wymaga publikacji Firebase oraz GitHub Pages; samo wysłanie commita nie wdraża Firebase. Przygotuj numer i historię raz, następnie uruchom `.firebase-hosting/Deploy-Hosting.ps1`. Pakiet publiczny ma jawną listę plików i nie obejmuje narzędzi, kluczy, dokumentacji ani testów. Potwierdź nową stronę przed aktualizacją kopii i przekierowań GitHub Pages.

Stare `/eduliga/` pozostaje pełną aplikacją. `eduliga-hosting.js` automatycznie przekierowuje tylko bez lokalnej sesji, wyników i parametrów odzyskiwania konta. Inni widzą informację o nowym adresie i mogą nadal ćwiczyć na starym. Przycisk przejścia zalogowanego użytkownika najpierw sprawdza zapis wyników w Supabase. Wyniki gości pozostają na starym adresie; nie są samoczynnie kopiowane na nową domenę. Sesje i tokeny logowania nie są przenoszone między domenami. Stare `/ortoliga/` nadal kieruje do chronionego `/eduliga/`.

Test 17.10.2026: utworzenie nowego konta przez ten sam endpoint co formularz, dostarczenie potwierdzenia na testowy alias właściciela, aktywacja na nowym adresie, poprawna odpowiedź za 10 aXP, odświeżenie i niezależne logowanie/odczyt z bazy zakończyły się poprawnie. To nie dowodzi gotowości masowej rejestracji: custom SMTP pozostaje wyłączone. Domyślna poczta Supabase ma ograniczenia odbiorców i niski limit wysyłki. Przed szerszą publikacją skonfiguruj własny SMTP; nie wyłączaj potwierdzania adresów bez odrębnej decyzji.

## Unikalne pseudonimy i Pomocnik — 0.67

Wdrożono migracje 202610170001 (SELECT student_profiles tylko dla istniejącego service_role, po zgodzie użytkownika), 202610170002 (prywatne rezerwacje nazw, indeks unikalny profili, trigger Auth, publiczne RPC zwracające wyłącznie dostępność nazwy) oraz 202610170003 (potwierdzone konto Filipa 84daf817-d5a0-43ae-a346-1867e011d79f → admin). Domyślna poczta SMTP pozostaje bez zmian i nadal wymaga konfiguracji przed masową rejestracją.

Nazwy są porównywane po NFC, usunięciu skrajnych spacji, połączeniu wielokrotnych spacji i zmianie liter na małe. Rezerwacja powstaje w tej samej transakcji co nowe konto Auth, więc obejmuje też konta oczekujące na potwierdzenie e-mail i równoczesne próby rejestracji. Nazwy z różnymi literami akcentowanymi pozostają różne. Baza uwalnia rezerwację po zatwierdzonym trwałym usunięciu konta. Formularz sprawdza dostępność, a ograniczenia bazy zapewniają ostateczną blokadę. Nie publikuj prywatnej listy rezerwacji; jej tabela ma RLS i brak dostępu dla klientów.

Prawa administratora są powiązane z UUID, nie z tekstem admin. Nazwa admin należy do dotychczasowego konta Filipa; 10e91715-5313-4149-b36b-e426aba31ab0 jest kontem Dominika. Nie zamieniaj tych identyfikatorów. InitSync pobiera aktualną nazwę z Auth, a ensure_student_profile korzysta z nazwy w bazie, żeby stara sesja nie cofnęła zmiany.

Liga Pomocnika: administratorzy mają dwa jawne przyciski widoku. Widok ucznia (domyślny) ukrywa usunięte pytania, odpowiedzi, ich zdjęcia i przyciski moderacji; liczniki odpowiedzi pomijają usunięte odpowiedzi. Widok administratora pokazuje wszystko i przywracanie. Przełączenie zamyka aktywny wątek i odświeża listę. Zmiana konta resetuje wybór do widoku ucznia. Uprawnienia bazy pozostają przypisane do administratora — to przełącznik widoku, nie zmiana roli.

### Weryfikacja 0.67–0.68

Logowanie pseudonimem na osobnym koncie testowym zakończyło się HTTP 200, z zachowaniem jego 10 aXP. Test bazy z próbą zmiany tego konta na ADMIN ze spacjami został odrzucony przez ograniczenie unikalności; nazwa testowa pozostała bez zmian. Anonimowe RPC dostępności odrzuciło admin, ADMIN, skrajne spacje i powielone spacje w zajętej nazwie. Nowa nazwa była dostępna. Próba odczytu prywatnego rejestru nazw jako anon została odrzucona (401). W przeglądarce konto administratora pokazało dwa widoki Pomocnika: usunięte pytanie było niewidoczne w widoku ucznia, a widoczne z przywracaniem w widoku administratora. Nie zmieniano prawdziwych wpisów podczas testu.

W 0.68 główny setSyncUser pobiera bieżący profil Auth również przy zdarzeniach odtworzenia starej sesji. Stare metadane z otwartej wcześniej karty nie powinny przywracać nazwy Filip. Konfiguracja SMTP nadal wymaga osobnej pracy.

Potwierdzenie końcowe 17.10.2026: UI 0.68 pokazuje admin po odtworzeniu sesji, punkty i prawa administratora zachowane. Zatwierdzone konto testowe usunięto; kontrola auth.users, student_profiles, student_progress i student_name_claims zwróciła 0/0/0/0. Test formularza potwierdził komunikat zajętej nazwy, brak rejestracji przy niedostępności sprawdzania i poprawne rozpoznanie konfliktu równoczesnych prób. Hasło usuniętego konta testowego nie jest potrzebne i lokalny plik prywatny usunięto.

## 0.69 — fiszki, prośby Pomocnika i punktacja bitew

Trzecie formy wszystkich 40 czasowników są lokalnym dodatkiem fiszek w eduliga-topics.js. Nie dodawaj ich do pól ocenianych ani pytań bitwy. Pierwsze formy mają wyraźne kolorowe tła, trzecia szare oznaczenie na później. Lektor odkrytej fiszki czyta wszystkie trzy.

Czat pobiera maksymalnie 50 ostatnich nierozwiązanych i nieusuniętych pytań helper_topics, pod istniejącym RLS, co 5 sekund przy aktywnej stronie. Znaczniki odczytu są lokalne dla UUID użytkownika, bez zmiany schematu. Własne pytania nie liczą się jako nowe. Ikona pokazuje oddzielne graficzne znaczniki dla wiadomości, bitew i pomocy; zakładka Pomocnika prowadzi do konkretnego wątku. Publicznie niezalogowani nie pobierają próśb. Nie stosuj publicznego kanału broadcast do treści pytań.

Nowa punktacja dotyczy całej odpowiedzi w rundzie. Poprawna pokonuje wszystkich błędnych/pominiętych i wolniejsze poprawne odpowiedzi. +10 za każdego pokonanego, poprawna bez pokonanych +5, błąd/pominięcie/timeout −5. Remis czasu nie pokonuje zremisowanego. Bonus tylko przy jednym najszybszym poprawnym graczu: floor((najwolniejszy czas wszystkich − jego czas)/1000), maksymalnie 30. Timeout liczy się jako 30 s. Pakiety po terminie są odrzucane. Zakończenie rundy pozostaje automatyczne po odpowiedziach wszystkich aktywnych uczestników albo po 30 s. Kanały bitew liga-v069 oddzielają nowe zasady od wcześniej otwartych kart v063. Gra nadal używa prowadzącego klienta, nie serwerowego autorytetu czasu i punktacji.

## Wydanie 0.70

- Angielski ma wspólny zestaw `all` (40 czasowników) i dział `tenses`: 15 fiszek zasad oraz 54 zadania z jedną luką dla Present Simple, Present Continuous i Past Simple. Trening dowolnego niepustego połączenia czasów; po trzech poprawnych odpowiedziach wzrost poziomu, maksymalnie 3. Nagrody 10/15/20 aXP, błąd −5; ta sama historia aXP, bez zmiany wcześniejszych wyników. Fiszki bez punktów.
- Bitwa czasów losuje z całej bazy trzech czasów, korzysta z istniejących rund 30 s / 10 rund i punktacji za rywali; osobny kanał `tenses`. Nowy temat zaproszenia przenosi do odpowiedniego pokoju. Nieregularne zachowują pytania o dwie formy.
- Prywatne pomysły w centrum czatu: autor widzi swoje wpisy, istniejący administratorzy wszystkie i licznik nieobejrzanych. Jedno zdjęcie JPG/PNG/WebP (do 15 MB przed zmniejszeniem; JPG do 6 MB po), prywatny bucket suggestion-images, link 5 minut, status obejrzenia przez admina. Brak e-maili i punktów za pomysły. Odświeżanie co 15 sekund, ochrona szkiców.
- Migracja `202610170004_suggestions_and_tenses.sql` wdrożona do istniejącego projektu przez SQL Editor przed publikacją aplikacji; potwierdzenie Success. RLS ogranicza odczyt treści i zdjęć do autora i administratorów, zapis wyłącznie RPC z limitem 30 sekund. Nie zmieniono uprawnień do istniejących wiadomości.

## Wydanie 0.71

Nieregularne mają jeden kafelek i wspólny wybór części w stylu modułu czasów. Pola części 1 / 2 można łączyć; przynajmniej jedno pozostaje zaznaczone. Domyślnie obie części. Wybór steruje istniejącym selectEnglishVocabulary, fiszkami, postępami i kanałem bitwy (part1 / part2 / all). Przy zmianie opuszczamy poprzedni pokój i resetujemy serię, bez kasowania punktów. Zachowano obsługę starych identyfikatorów zaproszeń. Brak migracji bazy.
Pełne i skrócone formy w module czasów są pokazywane razem w odpowiedziach treningu i areny oraz przy przykładach fiszek. Pary znaczą to samo; ocena nadal akceptuje oba warianty.

## Wydanie 0.72

Każde sprawdzone zadanie czasów otrzymuje objaśnienie konstrukcji (twierdzenie / pytanie / przeczenie), odmiany be, operatorów, końcówek i określeń czasu. W arenie objaśnienie jest też w wynikach rundy, również po braku odpowiedzi. Wskazówka (np. not / be) została przeniesiona do kolorowego oznaczenia tuż przed polem. Prawidłowe They are not / aren’t at home on Mondays pozostaje w bazie; nie zmieniamy go na don’t be. Brak migracji.

## Wydanie 0.73

Menu zadań obu lig językowych jest ukrywane przed wyborem działu oraz na ekranie kafelków zakresu, także po powrocie przez Zmień dział. Przyciski lig i powrót do strony głównej pozostają dostępne. Bitwa angielskich czasów ma limit 90 sekund, inne działy 30; wspólna funkcja ustala odliczanie, termin odpowiedzi, czas przy braku odpowiedzi i limit bonusu lidera. Nowy kanał liga-v073-english-tenses izoluje graczy od starszych kart z limitem 30 s; potrzebne odświeżenie. Brak migracji.

## Wydanie 0.74

Migracja 202610170005_admin_signup_notifications.sql tworzy trwałe zdarzenia nowych kont przez trigger AFTER INSERT w Auth. Nie dodaje historycznych kont. Zdarzenie powstaje w transakcji rejestracji, raz na użytkownika; usunięcie konta usuwa jego powiadomienie. Migruj przed publikacją klienta. Bez adresów e-mail i haseł w danych klienta; tylko pseudonim i czas. Bezpośredni dostęp do tabeli jest zablokowany RLS i brakiem uprawnień; RPC sprawdza istniejące is_chat_admin. Inni użytkownicy dostają puste wyniki. Odczyt osobny dla każdego admina, przechowywany na serwerze; klient oznacza tylko pokazane identyfikatory. Nieodczytane pierwsze, do 100 naraz, odświeżanie co 5 sekund przy widocznej stronie. Czyszczenie stanu przy zmianie konta.

Sprawdzono ustawienia Supabase Auth → SMTP: własny SMTP jest wyłączony. W tym wydaniu nie skonfigurowano usługi wysyłki ani powiadomień e-mail; domyślnych wiadomości logowania nie wykorzystujemy do alertów administratora.

## Wydanie 0.75

- Wyjaśnienia w treningu czasów są zwijane pod Dlaczego tak?, bez automatycznego rozwinięcia. Tę samą formę otrzymały wskazówki dyktanda, nieregularnych i hiszpańskiej pisowni, par oraz zdań.
- Teoria czasów: 18 fiszek na czas (54), kategorie Zastosowanie / Budowa / Pisownia / Pułapki. Karty zawierają regułę, przykład, a rozbudowane także schemat, tłumaczenie i wskazówkę. Wymowa przykładów, pełne i skrócone formy, filtrowanie kategorii. Bez nagród za samo przewracanie kart.
- Arena zastępuje powielone wyniki i tabele jednym wykresem SVG z osobną linią zawodnika, sumą punktów i stanem odpowiedzi. Wyniki zmieniają się po rozliczeniu rundy; czerwony punkt oznacza niepoprawną odpowiedź lub brak odpowiedzi. Przyciski rund pozwalają wrócić do prawidłowego zapisu, własnego błędu oraz odpowiedzi wszystkich. Bieżące odpowiedzi rywali ujawniają się dopiero po zamknięciu rundy. W stanie pokoju zachowujemy kanoniczne zadania z maksymalnie 10 rund. Odczyt wyników nie zmienia naliczania punktów.
- Kanały liga-v075- izolują nowy format pokoju od starszych kart. Uczestnicy muszą odświeżyć aplikację. Limity czasu i punktacja pozostają bez zmian: 90 s czasy, 30 s pozostałe. Brak migracji bazy.

## Powiadomienia administratora na Androidzie (0.82)
Po migracji 202610190003_admin_push.sql wdroż funkcję admin-push z verify_jwt=false (sesję weryfikuje funkcja przez Auth getUser). Wbudowane sekrety projektu pozostają bez zmian. Pierwsze włączenie przez administratora generuje klucze VAPID na serwerze i zapisuje je tylko w chronionej tabeli admin_push_keys. Nie publikuj ani nie odczytuj klucza prywatnego w przeglądarce.
Na Androidzie: Chrome → eduliga.web.app → zaloguj konto administratora → ⚙️ obok czatu → Powiadomienia → Włącz powiadomienia → Zezwól. Przycisk Wyślij próbne pozwala sprawdzić dostarczenie. Wysyłanie aktywności działa dla zalogowanych osób, przy widocznej stronie i ostatniej interakcji do dwóch minut. Powrót po trzech minutach przerwy może wysłać wiadomość, najwyżej raz na 30 minut na osobę, bez powiadamiania siebie. Zablokowany internet, oszczędzanie baterii i wymuszone zatrzymanie Chrome mogą opóźnić lub uniemożliwić dostarczenie. Goście pozostają anonimowi w oddzielnym podglądzie. Wylogowanie nie wyłącza powiadomień tego urządzenia; wyłącz je przyciskiem przed udostępnieniem telefonu.

Panel 0.82: koło zębate obok czatu jest widoczne wyłącznie po potwierdzeniu roli administratora przez istniejący RPC. Oddzielne sekcje: powiadomienia urządzenia, nowe konta, anonimowi goście, skrzynka pomysłów i moderacja wspólnego czatu. Zwykły czat zawiera tylko własne zgłoszenia i nie pokazuje usuniętych wiadomości także administratorom. Moderacja jest odwracalna, przez dotychczasowy zabezpieczony RPC.

## Wydanie 0.83 — odzyskiwanie dostępu, bitwy i diagnostyka
- Najpierw wykonaj migrację 202610190004_diagnostics.sql w istniejącym projekcie Supabase. Nowa tabela jest niedostępna bezpośrednio dla klientów; zapis RPC przyjmuje tylko kody z listy, wersję, ligę i typ urządzenia. Sesja jest losowym identyfikatorem bieżącej karty, bez danych wpisanych do formularza. Jeśli użytkownik jest zalogowany, serwer bierze jego ID z auth.uid(), nie z argumentu klienta. Nieudane anonimowe logowanie nie identyfikuje osoby. Limit 30 zdarzeń/sesję/godzinę, jeden kod/minutę oraz ogólny limit 10 000/dzień ograniczają przypadkowy zalew; nie zastępują ochrony brzegowej przed celowym atakiem. Panel tylko dla is_chat_admin, do 150 zdarzeń i podsumowania z 1/7/30 dni. Panel pokazuje zdarzenia od wdrożenia; nie rekonstruuje dawnych błędów. To diagnostyka klienta, nie pełny audyt Auth.
- Panel: ⚙️ → Diagnostyka. Oddzielone od czatu. Kategorie: logowanie, linki odzyskiwania, odczyt/zapis postępów, łączenie bitew i pamięć urządzenia. Brak haseł, adresów e-mail, tokenów, odpowiedzi i prywatnych rozmów. Krótkie niedostarczone zdarzenia czekają w pamięci bieżącej karty maksymalnie godzinę; zmiana konta odrzuca ich kolejkę.
- Odzyskiwanie: e-mail użytkownika, wyraźne kroki dla resetu i potwierdzenia konta, podgląd hasła, powtórzenie nowego hasła, blokada równoległych wysyłek i 60 s przerwy. To nie usuwa limitów e-maili usługodawcy. Nie zmieniono SMTP ani danych kont. Wygasły link kieruje do prośby o nowy; używaj najnowszej wiadomości.
- Bitwy: protokół liga-v083- izoluje nowy format od starszych kart. Każdy gracz powinien odświeżyć stronę przed kolejną bitwą. Ponawianie kanału z rosnącym odstępem do 30 s, ręczne ponowienie, oczekiwanie offline, automatyczny powrót po odzyskaniu internetu. Odpowiedź czeka na potwierdzenie pokoju, ponawiana jest z tym samym meczem i rundą. Stan, robocza odpowiedź i odpowiedź wysłana przechowywane w sessionStorage, osobno dla konta, ligi i zakresu, do 10 minut; ponowne wejście do tej samej bitwy w tej karcie wznawia stan. Świadome opuszczenie pokoju usuwa tę kopię. Brak odpowiedzi po 30/90 s pozostaje błędem −5; przerwa w internecie nie przedłuża czasu. Bez kary natychmiast po utracie presence. Zwykłe odświeżenie tożsamości konta nie opuszcza pokoju, ale zmiana konta nadal tak. Nagrody odebranych ukończonych rund odtwarzane po identyfikatorach meczu i rundy — istniejące zdarzenia pomijane.
- Ograniczenie: pokój nadal korzysta z Realtime i gospodarza wybieranego spośród obecnych graczy. Nie ma centralnego serwera rozgrywki. Nie gwarantuje odtworzenia bitwy, gdy wszyscy zamkną karty i stracą lokalny stan; klient gospodarza nie jest mechanizmem zabezpieczenia przed oszustwami. Nie publikuj jako całkowicie odporne na rozłączenia ani jako grę o realne nagrody.
- Telefon: duże pola i cele dotykowe, pytanie nad wykresem, czytelny stan połączenia, schowanie pływających ikon przy klawiaturze tam, gdzie visualViewport pozwala ją wykryć. Menu główne → Wygoda nauki: mniej animacji i brak automatycznej wymowy (przyciski odtwarzania nadal działają). Preferencje tylko na urządzeniu. Nie zmieniono czasu treningów i punktacji.
- Wdrożenie bazy 20.10.2026: migracja 202610190004_diagnostics.sql wykonana w istniejącym projekcie Supabase; edytor potwierdził Success. No rows returned. Brak zmian funkcji Edge. Nie uruchamiano testów, ponieważ bieżące polecenie nie obejmowało testowania. Publikacja klienta po migracji, numer wersji zwiększony raz przez Update-Version.ps1.

## Wydanie 0.84 — konta w statystykach i raport Web Push
- Migracje: 202610200001_member_activity.sql, potem 202610200002_push_delivery.sql, potem nowy admin-push; dopiero później frontend. Dwie migracje wykonane 20.10.2026 w dotychczasowym projekcie, Supabase potwierdził Success. No rows returned. Wywołania funkcji admin-push nadal ręcznie weryfikują sesję przez auth.getUser i rolę administratora; ustawienia bramki JWT nie zmieniaj.
- Panel ⚙️ → Zalogowani wykorzystuje oddzielne tabele sesji i zdarzeń kont. RLS bez bezpośrednich grantów dla klientów. Zapis tylko authenticated, właściciel pochodzi z auth.uid(), nie da się dopisać do sesji innego konta. Unikalne ID zdarzeń deduplikują ponowienie. Do 20 zdarzeń w żądaniu, 2000 zdarzeń w sesji, 100 nowych sesji/konto/dzień oraz 2000 sesji dziennie na aplikację. Odstęp czasu bez heartbeat ponad 90 s nie nalicza aktywności. Sesja klienta w bieżącej karcie i koncie, nowa po 30 min przerwy; szacowany czas aktywności nie jest pomiarem czasu nauki. Brak odpowiedzi tekstowych, nazw pól, e-maili, tokenów, nagrań ekranów i treści rozmów.
- Podgląd admina: dziś (według Europe/Warsaw), 7/30 dni; różne konta, sesje, aktywni w 2 min, poprawne/błędne, ligi, moduły, pseudonim i ostatnia aktywność. Ostatnie 20 sesji ma do 8 ostatnich zdarzeń; lista do 100 kont. Szczegóły od 0.84. Osobne ostatnie logowanie z Auth to tylko ostatnie pełne sign-in dla każdego konta w okresie; nie rekonstruuje historii wejść i nie oznacza bieżącej obecności. Administratorów nadal sprawdza is_chat_admin. Punkty i rankingi pozostają niezależne od statystyk odwiedzin.
- Badanie zgłoszenia: Auth potwierdził Grzegorz 19.10.2026 19:48 czasu Warszawy. Brak jego wiersza student_push_activity. Konto admin miało jedno urządzenie zapisane 19.10 o 18:32; Dominik zero. Klucze były skonfigurowane. W tabeli aktywności były tylko admin i Dominik, brak pełnego historycznego raportu wysyłek. To potwierdza brak odebranego sygnału Grzegorza, ale nie dowodzi, jakiego adresu i jakiej wersji używał.
- Poprawka CORS funkcji admin-push dopuszcza dokładnie Firebase i istniejący origin czasowstrzymywacz-a11y.github.io, z Vary: Origin; autoryzacja bez zmian. Jest to usunięcie wykrytego problemu ze starym adresem, nie dowód przyczyny konkretnego wejścia Grzegorza. Frontend ponawia wykrywanie aktywnego konta także po odtworzeniu karty. Nowy moduł kont może uruchomić dotychczasowy heartbeat po udanym zapisie statystyk. Limit powiadomień i warunki aktywności bez zmian.
- Raport ⚙️ → Powiadomienia pokazuje liczbę urządzeń adminów oraz ostatnią odebraną aktywność z ostatnią próbą wysyłki: odbiorcy, przyjęte, błędy. Brak endpointów i kluczy w raporcie. Wynik przyjęcia przez FCM nie jest potwierdzeniem wyświetlenia na telefonie. Brak odbiorców lub udanego przyjęcia nie blokuje kolejnego wejścia na 30 min. Pozostają ograniczenia systemowe Androida i konieczność włączenia powiadomień na telefonie. Stare próby nie mają metryk wysyłki.

## Wydanie 0.85 — łączenie bitew i lista pokojów

Najpierw wdroż 202610200003_battle_rooms.sql w istniejącym projekcie. Przejście z zawodnego rozgłaszania Realtime na synchronizację HTTP: heartbeat i odbiór co sekundę podczas pobytu w pokoju, pakiety stanu co około 3 sekundy lub po zmianie. Tożsamość i nazwa z Auth, jedno członkostwo na konto, osobny connection_id chroni przed opóźnionym opuszczeniem starego pokoju. Pokój wyznacza kanoniczna para liga/temat. Zaproszenia i przycisk Dołącz przekazują temat jawnie; nie otwierają ponownie wyboru ligi i nie zmieniają go na domyślny.

Tabele mają RLS i brak bezpośrednich uprawnień klientów; RPC wymaga zalogowania, poprawnego zakresu i aktualnego członkostwa. Stan może publikować wyłącznie najstarszy aktywny gracz. Lista pokojów pokazuje tylko nazwy, ID, zakres, etap, rundę i liczbę osób, bez e-maili i kluczy. Członkostwo wygasa po 45 sekundach bez heartbeat; pakiety odbierane do 3 minut, usuwane po 5 minutach przez ograniczone sprzątanie. Są transportem gry, a nie historią wyników. Gospodarz nadal losuje, mierzy czas i oblicza punkty; ta zmiana nie jest pełną ochroną przed oszukiwaniem przez zmodyfikowanego klienta. Limity 30/90 sekund, 10 rund i dotychczasowa punktacja zachowane.

Czat → ⚔️ Bitwy: lista odświeżana co 5 sekund tylko w otwartej zakładce. Dołącz wybiera zakres, potwierdza członkostwo i zamyka czat. Stare otwarte wersje używają poprzedniego transportu — wszyscy gracze muszą odświeżyć aplikację po publikacji.

## Wydanie 0.86 — zdjęcia Pomocnika w kilku partiach

Przed frontendem wdroż migrację 202610200004_helper_photos.sql. Nowa helper_attachments ma powiązania z pytaniem i opcjonalną odpowiedzią, autora z auth.uid(), unikalną ścieżkę zdjęcia oraz numer porządkowy. Zalogowani odczytują tylko załączniki dostępnych wpisów, administratorzy również ukrytych; widok ucznia nadal filtruje ukryte wpisy. Bezpośrednie modyfikacje tabeli są zablokowane. Storage pozostaje prywatny; jego polityki uwzględniają nowe załączniki, także przy ochronie przed usunięciem używanego pliku. Starsze pojedyncze image_path są zachowane i deduplikowane w galerii.

helper_post_images tworzy wpis przez dotychczasowy helper_post i dołącza zdjęcia w jednej transakcji. Zasady +5 pXP za odpowiedź, limit 10 nagradzanych odpowiedzi dziennie i +15 za podziękowanie pozostają w dotychczasowych RPC. helper_add_images blokuje konkretny wpis na czas zapisu, sprawdza autorstwo, widoczność, własny folder plików i limity: 10 zdjęć w partii, 30 łącznie w jednym wpisie. Dodatkowe partie nie dodają punktów ani nowych odpowiedzi.

Formularz zachowuje wcześniejsze wybory galerii i aparatu, pokazuje numerowane podglądy oraz usuwa wybrane zdjęcie tylko z kolejki. Wysyła pliki sekwencyjnie ze wskaźnikiem postępu; do 20 MB na oryginał, JPEG po zmniejszeniu do 1800 px i 6 MB na zapisany plik. Błąd pozostawia treść i kolejkę w otwartym formularzu. Zmiana konta przerywa dalszy zapis; nie opieraj autorstwa na ID podanym z klienta. Nowy przycisk Dodaj kolejne zdjęcia jest tylko przy własnych nieusuniętych wpisach. Galerie zachowują kolejność, odczyt metadanych jest stronicowany.

Poprawka formularza Pomocnika w 0.86: zdarzenia ortoliga-auth-change pojawiają się również po odświeżeniu sesji i updateSyncUi dla tego samego konta. Nie zamykamy przy nich otwartego formularza ani nie zerujemy aktywnego pytania. Reset i czyszczenie zdjęć tylko przy rzeczywistej zmianie identyfikatora konta lub wylogowaniu.
