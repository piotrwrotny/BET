<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: admin-users-student-scope-pagination-fix

- **Plan**: `context/changes/admin-users-student-scope-pagination-fix/plan.md`
- **Zakres**: Faza 1–2 z 2
- **Data**: 2026-06-26
- **Werdykt**: NEEDS ATTENTION
- **Ustalenia**: 0 krytycznych, 4 ostrzeżeń, 3 obserwacji

## Werdykty

| Wymiar | Werdykt |
|--------|---------|
| Zgodność z planem | PASS |
| Dyscyplina zakresu | PASS |
| Bezpieczeństwo i jakość | WARNING |
| Architektura | PASS |
| Spójność wzorców | PASS |
| Kryteria sukcesu | PASS |

## Ustalenia

### F1 — Błąd books nadpisuje błąd users i blokuje tabelę

- **Ważność**: ⚠️ WARNING
- **Wpływ**: 🔎 MEDIUM — prawdziwy kompromis; zatrzymaj się, aby to przemyśleć
- **Wymiar**: Bezpieczeństwo i jakość
- **Lokalizacja**: `src/pages/admin/users.astro:29-36`
- **Szczegóły**: Gdy `getStudentsWithAccess()` zwróci dane, ale zapytanie `books` zakończy się błędem, `errorMessage` zostaje nadpisany komunikatem books i tabela users nie zostaje wyrenderowana. Plan Fazy 2 wymaga twardego błędu dla danych users, ale nie zakłada, że błąd books powinien blokować widok users.
- **Poprawka A ⭐ Zalecana**: Rozdziel stan błędu na `usersError` i `booksError`; renderuj `UsersTable` przy braku `usersError`, a błąd books pokaż osobnym, nieblokującym komunikatem.
  - Siła: Zachowuje zamierzoną twardość błędu users, nie psuje jednocześnie działania listy przy chwilowym problemie z katalogiem książek.
  - Kompromis: Nieznacznie zwiększa stan strony.
  - Pewność: HIGH — zmiana dotyczy tylko lokalnego zarządzania błędami w jednym pliku.
  - Martwy punkt: Nie weryfikowano, czy `UsersTable` radzi sobie z pustą listą books.
- **Poprawka B**: Traktuj dowolny błąd danych jako twardy błąd strony (jak obecnie), ale udokumentuj to w planie jako zamierzone zachowanie.
  - Siła: Prostszy model mentalny.
  - Kompromis: Chwilowy problem z books uniemożliwia zarządzanie studentami.
  - Pewność: MEDIUM — wymaga aktualizacji planu i akceptacji użytkownika.
  - Martwy punkt: Nie sprawdzono wywołań API.
- **Decyzja**: FIXED via Poprawka A

### F2 — Brak chunkowania w `.in("user_id", userIds)`

- **Ważność**: ⚠️ WARNING
- **Wpływ**: 🔎 MEDIUM
- **Wymiar**: Bezpieczeństwo i jakość
- **Lokalizacja**: `src/lib/services/user-admin.ts:76`
- **Szczegóły**: Po pełnej paginacji auth users cała lista `userIds` trafia do jednego zapytania `.in("user_id", userIds)`. Przy dużej liczbie kont może przekroczyć limity URL/query-time Supabase.
- **Poprawka**: Podziel `userIds` na chunki ~100–200 i wykonaj zapytania równolegle lub sekwencyjnie, agregując wyniki.
  - Siła: Zapobiega awarii widoku przy wzroście liczby kont.
  - Kompromis: Minimalna złożoność i jeden dodatkowy helper.
  - Pewność: HIGH — wzorzec chunkowania powszechny w podobnych zapytaniach.
  - Martwy punkt: Brak testów obciążeniowych.
- **Decyzja**: FIXED

### F3 — Surowe komunikaty błędów Supabase trafiają do API i UI

- **Ważność**: ⚠️ WARNING
- **Wpływ**: 🏃 LOW — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Bezpieczeństwo i jakość
- **Lokalizacja**: `src/lib/services/user-admin.ts:84,88`, `src/pages/api/admin/users.ts:21`
- **Szczegóły**: Plan wymaga hard fail, ale nie specyfikuje maskowania błędów. Rzucanie/powielanie surowych komunikatów Supabase może leakować szczegóły implementacji do klienta.
- **Poprawka**: Loguj oryginalny błąd po stronie serwera (np. `console.error` lub później Sentry), a do callerów/API zwracaj generyczny komunikat typu "Nie udało się pobrać użytkowników".
  - Siła: Usuwa ryzyko leakowania wewnętrznych szczegółów.
  - Kompromis: Utrudnia debugowanie z poziomu klienta — kompensuje logowanie server-side.
  - Pewność: HIGH — standardowy wzorzec w API.
  - Martwy punkt: Brak warstwy logowania poza `console.error`.
- **Decyzja**: FIXED

### F4 — Pojedynczy auth user bez roli zabija całą listę

- **Ważność**: ⚠️ WARNING
- **Wpływ**: 🔎 MEDIUM
- **Wymiar**: Bezpieczeństwo i jakość
- **Lokalizacja**: `src/lib/services/user-admin.ts:96-99`
- **Szczegóły**: Auth user bez odpowiedniego wiersza w `user_roles` powoduje throw i uniemożliwia załadowanie listy studentów. Plan wymaga student-only scope, ale brak roli to edge case, który nie powinien blokować panelu.
- **Poprawka**: Loguj orphaned IDs i pomijaj takich użytkowników (lub zwracaj ich osobno do audytu), zamiast rzucać wyjątek.
  - Siła: Zwiększa odporność panelu na niespójności danych.
  - Kompromis: Ciche pominięcie może ukryć problem z rejestracją; warto dodać osobny alert dla admina.
  - Pewność: MEDIUM — decyzja produktowa, czy brak roli to błąd krytyczny.
  - Martwy punkt: Nie zweryfikowano, jak często występuje taki stan.
- **Decyzja**: FIXED

### F5 — Brak safety cap w pętli paginacji auth users

- **Ważność**: 🔵 OBSERVATION
- **Wpływ**: 🏃 LOW
- **Wymiar**: Bezpieczeństwo i jakość
- **Lokalizacja**: `src/lib/services/user-admin.ts:42`
- **Szczegóły**: Pętla iteruje po stronach do pustej odpowiedzi. Przy anomalii w API może teoretycznie zapętlić się w nieskończoność, choć obecnie `page` rośnie i pusta strona kończy pętlę.
- **Poprawka**: Dodaj maksymalną liczbę stron (np. 1000) i rzuć błąd przy przekroczeniu.
  - Siła: Gwardia bezpieczeństwa przed błędami po stronie dostawcy auth.
  - Kompromis: Wymaga wyboru sensownego limitu.
  - Pewność: HIGH — trywialna zmiana.
  - Martwy punkt: Brak.
- **Decyzja**: FIXED

### F6 — Wzorzec obsługi błędu różni się od innych stron admina

- **Ważność**: 🔵 OBSERVATION
- **Wpływ**: 🏃 LOW — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Spójność wzorców
- **Lokalizacja**: `src/pages/admin/users.astro:23-27`
- **Szczegóły**: Pozostałe strony admina (np. books) używają `console.error` i renderują puste/częściowe dane. Plan celowo wprowadza `try/catch + ServerError`, ale warto rozważyć ustandaryzowanie tego wzorca.
- **Poprawka**: Rozważ przeniesienie `ServerError` + hard fail na pozostałe listy admina w osobnym change.
  - Siła: Spójne UX i lepsza widoczność błędów.
  - Kompromis: Szerszy zakres poza tym change.
  - Pewność: MEDIUM — decyzja projektowa.
  - Martwy punkt: Nie przeanalizowano wszystkich stron admina.
- **Decyzja**: FIXED partially — users.astro only; other admin pages reverted due to pre-existing type-safety lint errors

### F7 — `baseConfig` w eslint.config.js nie ma wzorca `files`

- **Ważność**: 🔵 OBSERVATION
- **Wpływ**: 🏃 LOW — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Spójność wzorców
- **Lokalizacja**: `eslint.config.js:14-38`
- **Szczegóły**: `baseConfig` stosuje `strictTypeChecked`/`stylisticTypeChecked` bez ograniczenia do plików TS/JS, co może powodować problemy z parsowaniem innych typów plików.
- **Poprawka**: Dodaj `files: ["**/*.{js,jsx,ts,tsx}"]` do `baseConfig` lub wyraźnie wykluczaj pliki nie-TS.
  - Siła: Czyściejsza konfiguracja i mniej błędów parsera.
  - Kompromis: Może ujawnić nowe błędy lint w plikach, które dotychczas były pomijane.
  - Pewność: HIGH — dobra praktyka ESLint flat config.
  - Martwy punkt: Nie uruchamiano pełnego lint po dodaniu `files`.
- **Decyzja**: FIXED

### F6 — Wzorzec obsługi błędu różni się od innych stron admina

- **Ważność**: 🔵 OBSERVATION
- **Wpływ**: 🏃 LOW
- **Wymiar**: Spójność wzorców
- **Lokalizacja**: `src/pages/admin/users.astro:23-27`
- **Szczegóły**: Pozostałe strony admina (np. books) używają `console.error` i renderują puste/częściowe dane. Plan celowo wprowadza `try/catch + ServerError`, ale warto rozważyć ustandaryzowanie tego wzorca.
- **Poprawka**: Rozważ przeniesienie `ServerError` + hard fail na pozostałe listy admina w osobnym change.
  - Siła: Spójne UX i lepsza widoczność błędów.
  - Kompromis: Szerszy zakres poza tym change.
  - Pewność: MEDIUM — decyzja projektowa.
  - Martwy punkt: Nie przeanalizowano wszystkich stron admina.
- **Decyzja**: PENDING

### F7 — `baseConfig` w eslint.config.js nie ma wzorca `files`

- **Ważność**: 🔵 OBSERVATION
- **Wpływ**: 🏃 LOW
- **Wymiar**: Spójność wzorców
- **Lokalizacja**: `eslint.config.js:14-38`
- **Szczegóły**: `baseConfig` stosuje `strictTypeChecked`/`stylisticTypeChecked` bez ograniczenia do plików TS/JS, co może powodować problemy z parsowaniem innych typów plików.
- **Poprawka**: Dodaj `files: ["**/*.{js,jsx,ts,tsx}"]` do `baseConfig` lub wyraźnie wykluczaj pliki nie-TS.
  - Siła: Czyściejsza konfiguracja i mniej błędów parsera.
  - Kompromis: Może ujawnić nowe błędy lint w plikach, które dotychczas były pomijane.
  - Pewność: HIGH — dobra praktyka ESLint flat config.
  - Martwy punkt: Nie uruchamiano pełnego lint po dodaniu `files`.
- **Decyzja**: PENDING
