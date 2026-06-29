<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Admin zarządza dostępem studentów do książek

- **Plan**: `context/changes/admin-user-book-access-management/plan.md`
- **Zakres**: Pełny plan (Faza 1 + Faza 2)
- **Data**: 2026-06-29
- **Werdykt**: REJECTED
- **Ustalenia**: 2 krytyczne, 7 ostrzeżeń, 10 obserwacji

## Werdykty

| Wymiar | Werdykt |
|--------|---------|
| Zgodność z planem | PASS |
| Dyscyplina zakresu | PASS |
| Bezpieczeństwo i jakość | FAIL |
| Architektura | PASS |
| Spójność wzorców | WARNING |
| Kryteria sukcesu | PASS |

## Weryfikacja automatyczna

| Polecenie | Wynik |
|-----------|-------|
| `npx tsc --noEmit` | PASS (brak błędów) |
| `npm run build` | PASS (build complete) |

## Ustalenia

### F1 — Strona ładuje wszystkich użytkowników bez paginacji

- **Ważność**: ❌ CRITICAL
- **Wpływ**: 🔬 HIGH — stawka architektoniczna; pomyśl dokładnie przed podjęciem decyzji
- **Wymiar**: Bezpieczeństwo i jakość (wydajność)
- **Lokalizacja**: `src/pages/admin/users.astro:23`, `src/lib/services/user-admin.ts`
- **Szczegóły**: `getStudentsWithAccess()` pobiera wszystkich użytkowników auth, a następnie wszystkie role i dostępy. Strona renderuje pełną listę w pamięci i DOM. Przy kilku tysiącach kont panel admina przestanie działać lub przekroczy limity Supabase.
- **Poprawka A ⭐ Zalecana**: Wprowadź paginację po stronie serwera (`page`/`per_page` w query string), przekaż tylko jedną stronę do `UsersTable`, i dodaj nawigację stron.
  - Siła: Skalowalność, zgodność z ograniczeniami Supabase, spójność z przyszłym wzorcem list admina.
  - Kompromis: Więcej kodu w serwisie i UI; wymaga synchronizacji sortowania/filtrowania z paginacją.
  - Pewność: HIGH — `auth.admin.listUsers` wspiera paginację natywnie.
  - Martwy punkt: Nie mierzono dokładnego progu wydajnościowego.
- **Poprawka B**: Załóż limit wewnętrzny (np. max 500 użytkowników) i ostrzeżenie admina przy przekroczeniu.
  - Siła: Szybka do wdrożenia, chroni przed awarią.
  - Kompromis: Obcięcie danych bez możliwości zobaczenia reszty; długoterminowo niewystarczające.
  - Pewność: HIGH — jeden warunek w serwisie.
  - Martwy punkt: Nie rozwiązuje rzeczywistego problemu skalowania.
- **Decyzja**: PENDING

### F2 — `getStudentsWithAccess()` rzuca wyjątek dla użytkownika bez roli

- **Ważność**: ❌ CRITICAL
- **Wpływ**: 🔎 MEDIUM
- **Wymiar**: Bezpieczeństwo i jakość (niezawodność)
- **Lokalizacja**: `src/lib/services/user-admin.ts:130,152`
- **Szczegóły**: Funkcja loguje „Skipping auth users without assigned roles”, ale w `reduce` rzuca `throw new Error('Missing role row for auth user ...')`. Jeden auth-user bez roli w `user_roles` zawiesi całą stronę `/admin/users`.
- **Poprawka**: Zamiast rzucać wyjątek, pomiń użytkowników bez roli (zgodnie z wcześniejszym logiem) lub przypisz im domyślną rolę `student`.
  - Siła: Panel admina działa nawet przy niekompletnych danych; zachowanie zgodne z logowaniem.
  - Kompromis: Użytkownicy bez roli nie będą widoczni w panelu.
  - Pewność: HIGH — zmiana jednej gałęzi w reduce.
  - Martwy punkt: Brak znaczących.
- **Decyzja**: PENDING

### F3 — `grant`/`revoke` nie weryfikują roli docelowego użytkownika

- **Ważność**: ⚠️ WARNING
- **Wpływ**: 🔎 MEDIUM
- **Wymiar**: Bezpieczeństwo i jakość
- **Lokalizacja**: `src/pages/api/admin/users/[id]/grant.ts:30`, `src/pages/api/admin/users/[id]/revoke.ts:30`
- **Szczegóły**: Endpointy sprawdzają tylko, czy wywołujący jest adminem. Bezpośrednim wywołaniem API można nadać lub odebrać dostęp dowolnemu `user_id` (np. innemu adminowi), mimo że UI wyświetla tylko studentów.
- **Poprawka**: Przed mutacją sprawdź w `user_roles`, czy `parsedParams.data.id` ma rolę `student`. Zwróć 400/403 w przeciwnym razie.
  - Siła: API jest spójne z semantyką UI; nie można mutować dostępów adminów.
  - Kompromis: Dodatkowe zapytanie do `user_roles` w każdym mutacyjnym endpoincie.
  - Pewność: HIGH — RLS pozwala adminowi na SELECT `user_roles`.
  - Martwy punkt: Brak znaczących.
- **Decyzja**: PENDING

### F4 — Błędy Supabase są wysyłane bezpośrednio do klienta

- **Ważność**: ⚠️ WARNING
- **Wpływ**: 🏃 LOW
- **Wymiar**: Bezpieczeństwo i jakość
- **Lokalizacja**: `src/pages/api/admin/users/[id]/grant.ts:77`, `src/pages/api/admin/users/[id]/revoke.ts:67`
- **Szczegóły**: W przypadku błędu bazy zwracany jest `error.message`, co może ujawniać szczegóły SQL/bazy danych.
- **Poprawka**: Loguj szczegóły po stronie serwera (`console.error`), a klientowi zwracaj ogólny komunikat, np. „Nie udało się przyznać dostępu”.
  - Siła: Mniejsze ryzyko wycieku informacji o schemacie/błędach bazy.
  - Kompromis: Admin widzi mniej szczegółów w UI (ale szczegóły są w logach).
  - Pewność: HIGH — prosta zmiana w dwóch endpointach.
  - Martwy punkt: Brak znaczących.
- **Decyzja**: PENDING

### F5 — Pobierane są wszystkie książki bez limitu

- **Ważność**: ⚠️ WARNING
- **Wpływ**: 🏃 LOW
- **Wymiar**: Bezpieczeństwo i jakość (wydajność)
- **Lokalizacja**: `src/pages/admin/users.astro:29`
- **Szczegóły**: Query `books(id, title)` nie ma limitu. Przy dużej liczbie książek dropdown Select w UI będzie przeładowany.
- **Poprawka**: Dodaj `limit` do query lub zastąp Select asynchronicznym wyszukiwaniem.
  - Siła: Ochrona przed przeciążeniem UI.
  - Kompromis: Dla MVP z małą liczbą książek niekrytyczne.
  - Pewność: MEDIUM — zależy od przyjętego limitu.
  - Martwy punkt: Brak znaczących.
- **Decyzja**: PENDING

### F6 — Wiele równoległych zapytań do Supabase dla ról i dostępów

- **Ważność**: ⚠️ WARNING
- **Wpływ**: 🔎 MEDIUM
- **Wymiar**: Bezpieczeństwo i jakość (wydajność)
- **Lokalizacja**: `src/lib/services/user-admin.ts:94-100`
- **Szczegóły**: Dla N użytkowników generowane są `2 * ceil(N/200)` równoległych zapytań. Przy dużej liczbie studentów można przekroczyć limity rate-limitingowe Supabase.
- **Poprawka**: Rozważ paginację lub zmaterializowany widok/funkcję RPC ładującą stronę użytkowników razem z rolami i dostępem.
  - Siła: Mniejsza liczba zapytań przy dużej liczbie użytkowników.
  - Kompromis: Wymaga zmiany w serwisie i ewentualnie nowej migracji/funkcji DB.
  - Pewność: MEDIUM — zależy od wybranej ścieżki.
  - Martwy punkt: Nie mierzono rzeczywistych limitów Supabase.
- **Decyzja**: PENDING

### F7 — `fetch()` nie ustawia jawnie `credentials: 'same-origin'`

- **Ważność**: ⚠️ WARNING
- **Wpływ**: 🏃 LOW
- **Wymiar**: Bezpieczeństwo / Niezawodność
- **Lokalizacja**: `src/components/admin/UsersTable.tsx:84`
- **Szczegóły**: Wywołania `fetch` w `handleGrantBook` i `handleRevokeBook` polegają na domyślnym zachowaniu przeglądarki co do ciasteczek. W niektórych konfiguracjach może to prowadzić do braku sesji i 403.
- **Poprawka**: Dodaj `credentials: 'same-origin'` do obu wywołań `fetch`.
  - Siła: Jawne, bezpieczne zachowanie; spójne z wymaganiami sesji.
  - Kompromis: Brak.
  - Pewność: HIGH — jedna linia w dwóch miejscach.
  - Martwy punkt: Brak znaczących.
- **Decyzja**: PENDING

### F8 — Brak refetch-a listy po udanym grant/revoke

- **Ważność**: ⚠️ WARNING
- **Wpływ**: 🏃 LOW
- **Wymiar**: Zgodność z planem
- **Lokalizacja**: `src/components/admin/UsersTable.tsx:41-119,121-169`
- **Szczegóły**: Plan zakładał optymistyczną aktualizację lokalną **oraz refetch po sukcesie**. Obecnie pozostaje tylko stan optymistyczny; w przypadku równoległych zmian przez innego admina UI może być nieaktualne.
- **Poprawka**: Po udanym `grant`/`revoke` wywołaj ponownie `fetch('/api/admin/users')` i zaktualizuj `rows` danymi z serwera.
  - Siła: Spójność danych między adminami; zgodność z planem.
  - Kompromis: Dodatkowy request po każdej mutacji.
  - Pewność: HIGH — prosty `fetch` + `setRows`.
  - Martwy punkt: Brak znaczących.
- **Decyzja**: PENDING

## Obserwacje (nieblokujące)

- **O1**: GET `/api/admin/users` ma sprawdzanie same-origin, choć jest metodą bezpieczną. Nie jest to błąd, ale nadmiarowe ograniczenie.
- **O2**: `requireSameOrigin` jest powielone w trzech plikach; starsze endpointy robią to samo. Rozważ wydzielenie wspólnego helpera `src/lib/api-guards.ts`.
- **O3**: `getStudentsWithAccess()` używa service_role i nie ma wewnętrznego guardu — zakłada, że wywołujący sprawdził rolę admina. Warto dodać komentarz lub guard.
- **O4**: Nowe endpointy używają własnego `UUID_LIKE_RE` zamiast `uuidSchema` z `src/lib/utils.ts`.
- **O5**: `grant`/`revoke` używają JSON + `Response.json`, podczas gdy starsze endpointy admin używają formData + redirect. Uzasadnione przez React island, ale warto udokumentować.
- **O6**: `/admin/users` używa React island (`client:load`), podczas gdy inne strony admina są server-rendered. Akceptowalne, ale warto zadbać o wspólne wzorce dostępności.
- **O7**: `AUTH_USERS_PAGE_SIZE = 200` (plan wskazywał 100). Pętla kończy się gdy `pageUsers.length === 200`; jeśli Supabase zwróci stronę krótszą, paginacja skończy się prawidłowo.
- **O8**: `UsersTable` używa pojedynczego Select do dodawania książek zamiast MultiSelect/combobox; funkcjonalnie pozwala dodać wiele książek bez nadpisywania istniejących.
- **O9**: `revoke` przyjmuje `book_id` w query string; parametry query mogą trafić do logów/proxy.
- **O10**: Upsert `grant` nie weryfikuje istnienia `book_id` w tabeli `books`; FK w bazie zabezpiecza, ale błąd FK może zostać zwrócony jako `error.message` do klienta.
