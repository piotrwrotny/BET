# Plan wdrożenia admin-users-student-scope-pagination-fix

## Przegląd

Naprawiamy 2 błędy kontraktu listy użytkowników w panelu admina: (1) do listy trafiają konta adminów zamiast samych studentów, (2) `listUsers()` cicho ucina wynik przy większej liczbie kont. Implementacja ma być wspólna dla API i strony Astro, bez duplikowania logiki.

## Analiza stanu obecnego

- `src/lib/services/user-admin.ts:43-44,85-93` zwraca wszystkich auth users z emailem; brak scope `student`.
- `src/lib/services/user-admin.ts:38` używa `auth.admin.listUsers()` bez paginacji.
- `src/pages/api/admin/users.ts:14-16` ostrzega tylko `console.warn` przy progu 50, ale zwraca 200 i dane mogą być ucięte.
- `src/pages/admin/users.astro:27` woła serwis bezpośrednio, więc user nie widzi żadnego sygnału o truncation.

## Pożądany stan końcowy

`/admin/users` pokazuje wyłącznie studentów i nie ucina listy przy 51+ kontach. Serwis paginuje `listUsers()` do końca zbioru, a konsumenci (`/api/admin/users` i `.astro`) używają tej samej logiki. Gdy pobranie danych jest niepełne/błędne, strona pokazuje twardy błąd i nie renderuje „pozornie poprawnej” tabeli.

### Kluczowe odkrycia:

- `src/lib/services/user-admin.ts:35-94` jest pojedynczym miejscem kontraktu danych users.
- `src/pages/api/admin/users.ts:12` i `src/pages/admin/users.astro:27` już reużywają serwis — dobry punkt do centralnego fixa.
- Supabase `auth.admin.listUsers` ma paginację (`page`, `perPage`), domyślnie 50 rekordów na stronę (Context7 + docs).

## Czego NIE robimy

- Brak zmian schematu DB i migracji.
- Brak zmian w modelu ról (`admin`/`student`) i RLS.
- Brak przebudowy UI tabeli users (poza obsługą błędu).
- Brak nowego endpointu — zostaje obecne `/api/admin/users`.

## Podejście do implementacji

Naprawa siedzi w warstwie serwisu (`user-admin.ts`), bo to jedyne miejsce wspólne dla API i Astro. Najpierw zmieniamy kontrakt serwisu: pełna paginacja + scope `student`. Potem tylko dostosowanie konsumentów do nowego kontraktu i twardego błędu. Dzięki temu eliminujemy drift i duplikację filtrów.

## Krytyczne szczegóły implementacji

`listUsers()` musi iterować po stronach do wyczerpania danych (nie pojedyncze wywołanie z dużym `perPage`). W przeciwnym razie wróci ten sam bug po wzroście wolumenu kont. Strona Astro ma pokazywać banner błędu i nie renderować tabeli, jeśli serwis rzuci wyjątek.

## Faza 1: Serwis users — scope studentów i pełna paginacja

### Przegląd

Budujemy poprawny kontrakt danych users w jednym miejscu: kompletny zbiór auth users, potem mapowanie ról/dostępów i finalny filtr do studentów.

### Wymagane zmiany:

#### 1. Warstwa serwisowa users

**Plik**: `src/lib/services/user-admin.ts`

**Cel**: Usunąć dwa źródła błędu: brak scope student-only i brak paginacji.

**Kontrakt**:
- Dodać helper paginacji po `auth.admin.listUsers({ page, perPage })` i iterować do pustej strony.
- Zmienić eksportowany kontrakt na zwracanie studentów (`role === "student"`) jako danych do panelu `/admin/users`.
- Zachować aktualny DTO `UserWithAccess` (id, email, role, created_at, books).
- W przypadku błędu pobierania dowolnej strony rzucać wyjątek (hard fail, bez partial success).

#### 2. Kontrakt wywołań serwisu

**Pliki**: `src/pages/api/admin/users.ts`, `src/pages/admin/users.astro`

**Cel**: Oba konsumery mają korzystać z tego samego, poprawionego kontraktu serwisu.

**Kontrakt**:
- Oba callsite używają tej samej funkcji serwisowej (student scope + pagination already enforced).
- Usunąć heurystykę `users.length >= 50` jako mechanizm poprawności (może zostać telemetry log, ale nie semantyka błędu).

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Build przechodzi: `npm run build`
- Lint przechodzi dla zmienionych plików: `npx eslint src/lib/services/user-admin.ts src/pages/api/admin/users.ts src/pages/admin/users.astro`

#### Weryfikacja ręczna:

- API `/api/admin/users` nie zawiera kont `role=admin`.
- Dla datasetu >50 users API zwraca pełny zbiór (bez cichego ucięcia).

**Uwaga implementacyjna**: Po automatycznej weryfikacji tej fazy zatrzymać się na ręczne potwierdzenie przed Fazą 2.

---

## Faza 2: Strona admin/users — twardy błąd i spójność UX

### Przegląd

Domykamy zachowanie strony dla błędów danych i sprawdzamy, że UI nie pokazuje częściowych/niepełnych wyników jako prawidłowych.

### Wymagane zmiany:

#### 1. Obsługa błędu na stronie users

**Plik**: `src/pages/admin/users.astro`

**Cel**: Przy błędzie serwisu strona ma jasno pokazać błąd i nie renderować tabeli z niepełnymi danymi.

**Kontrakt**:
- Zachować `ServerError` jako jedyny kanał błędu.
- Jeśli serwis rzuci wyjątek, tabela `UsersTable` nie renderuje się.
- Komunikat błędu ma jednoznacznie mówić, że dane users są niekompletne lub niedostępne.

#### 2. Spójność endpointu i strony

**Pliki**: `src/pages/api/admin/users.ts`, `src/pages/admin/users.astro`

**Cel**: API i SSR strona pokazują ten sam zbiór studentów i tę samą semantykę błędu.

**Kontrakt**:
- API zwraca 500 + `error` przy błędzie serwisu.
- Strona SSR czyta ten sam kontrakt (direct service) i pokazuje błąd analogicznie.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Build przechodzi: `npm run build`
- Lint przechodzi dla zmienionych plików: `npx eslint src/pages/admin/users.astro src/pages/api/admin/users.ts`

#### Weryfikacja ręczna:

- `/admin/users` pokazuje tylko studentów.
- Przy symulowanym błędzie serwisu strona pokazuje `ServerError` i brak tabeli.
- Zachowanie endpointu `/api/admin/users` i strony SSR jest spójne (ten sam zbiór, ten sam error semantics).

**Uwaga implementacyjna**: Po automatycznej weryfikacji tej fazy zatrzymać się na ręczne potwierdzenie.

---

## Strategia testowania

### Testy jednostkowe:

- Brak nowych testów jednostkowych w tym planie (hotfix kontraktu). Weryfikacja przez build + manual E2E flow.

### Testy integracyjne:

- Brak dedykowanych testów integracyjnych w tym planie.

### Kroki testowania ręcznego:

1. Zaloguj jako admin, otwórz `/admin/users`, potwierdź brak kont admin na liście.
2. Wywołaj `/api/admin/users` i porównaj liczbę rekordów z oczekiwanym zbiorem studentów.
3. Na danych >50 kont potwierdź brak ucięcia listy.
4. Zasymuluj błąd pobierania users i potwierdź: banner błędu + brak tabeli.

## Uwagi dotyczące wydajności

Pętla paginacji zwiększa liczbę requestów do Supabase wraz z wolumenem kont. Dla obecnego MVP koszt akceptowalny; poprawność danych ważniejsza niż pojedynczy request.

## Uwagi dotyczące migracji

Brak migracji DB. Zmiana dotyczy wyłącznie kontraktu serwisu i konsumentów.

## Referencje

- Powiązane badania: `context/changes/admin-user-and-access-mgmt/research.md`
- Kontrakt serwisu (obecny stan): `src/lib/services/user-admin.ts:35-94`
- Konsument SSR: `src/pages/admin/users.astro:26-30`
- Konsument API: `src/pages/api/admin/users.ts:11-18`

## Postęp

> Konwencja: `- [ ]` oczekujące, `- [x]` wykonane. Dodaj ` — <commit sha>`, gdy krok zostanie zrealizowany.

### Faza 1: Serwis users — scope studentów i pełna paginacja

#### Automatyczne

- [x] 1.1 Dodać paginację `listUsers(page/perPage)` w `user-admin.ts` — 88208fd
- [x] 1.2 Wymusić student-only scope w zwracanym zbiorze serwisu — 88208fd
- [x] 1.3 Użyć poprawionego kontraktu serwisu w API i stronie — 88208fd
- [x] 1.4 Build i scoped lint przechodzą — 88208fd

#### Ręczne

- [x] 1.5 API `/api/admin/users` nie zwraca kont admin — 88208fd
- [x] 1.6 API nie ucina danych przy >50 kontach — 88208fd

### Faza 2: Strona admin/users — twardy błąd i spójność UX

#### Automatyczne

- [x] 2.1 Strona `/admin/users` nie renderuje tabeli przy błędzie serwisu
- [x] 2.2 API + SSR utrzymują spójny kontrakt błędu
- [x] 2.3 Build i scoped lint przechodzą

#### Ręczne

- [x] 2.4 `/admin/users` pokazuje tylko studentów
- [x] 2.5 Przy błędzie danych widoczny `ServerError` i brak tabeli
- [x] 2.6 Spójność listy i błędu między `/api/admin/users` i `/admin/users`
