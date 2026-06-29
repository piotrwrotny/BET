<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Admin Content Creation (S-02)

- **Plan**: `context/changes/admin-content-creation/plan.md`
- **Zakres**: Wszystkie 4 fazy (automatyczne kryteria `[x]`, ręczne `[ ]`)
- **Data**: 2026-06-29
- **Werdykt**: REJECTED
- **Ustalenia**: 2 krytyczne, 8 ostrzeżeń, 7 obserwacji

## Werdykty

| Wymiar | Werdykt |
|-----------|---------|
| Zgodność z planem | WARNING ⚠️ |
| Dyscyplina zakresu | FAIL ❌ |
| Bezpieczeństwo i jakość | FAIL ❌ |
| Architektura | PASS ✅ |
| Spójność wzorców | WARNING ⚠️ |
| Kryteria sukcesu | WARNING ⚠️ |

## Weryfikacja automatyczna

| Polecenie | Wynik | Uwagi |
|---|---|---|
| `npm run build` | PASS ✅ | Brak błędów TypeScript |
| `npx astro check` | FAIL ❌ | 2 pre-existing błędy typów w `src/pages/dashboard.astro:36` i `src/pages/lessons/[id].astro:80`; nie są specyficzne dla S-02, ale blokują typecheck. |
| `npm run lint` | FAIL ❌ | Globalne błędy CRLF oraz pre-existing problemy; nie są specyficzne dla S-02. |

## Krytyczne ustalenia ❌

### F1 — XSS w podglądzie MarkdownEditor

- **Ważność**: ❌ CRITICAL
- **Wpływ**: 🏃 LOW — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Bezpieczeństwo i jakość
- **Lokalizacja**: `src/components/admin/MarkdownEditor.tsx:35-39`
- **Szczegóły**: Live preview renderuje `marked.parse(value)` przez `dangerouslySetInnerHTML` bez sanityzacji. Marked domyślnie nie usuwa surowego HTML, więc payload `<script>` lub `onerror` w treści lekcji wykona się w przeglądarce admina. Ta sama treść jest renderowana przez `marked.parse` na ścieżce studenta, tworząc stored XSS.
- **Poprawka**: Zaimportuj i zastosuj ten sam helper `sanitizeHtml` co w `src/pages/lessons/[id].astro:60` przed ustawieniem `dangerouslySetInnerHTML`.
- **Decyzja**: FIXED — `sanitizeHtml` zaimportowane z `@/lib/markdown` i zastosowane w `dangerouslySetInnerHTML`.

### F2 — Zarządzanie użytkownikami / `user_book_access` poza zakresem planu

- **Ważność**: ❌ CRITICAL
- **Wpływ**: 🔬 HIGH — stawka architektoniczna; wymaga decyzji o zakresie
- **Wymiar**: Dyscyplina zakresu
- **Lokalizacja**: `src/components/admin/UsersTable.tsx`, `src/pages/admin/users.astro`, `src/lib/services/user-admin.ts`, `src/pages/api/admin/users/[id]/grant.ts`, `src/pages/api/admin/users/[id]/revoke.ts`, `src/layouts/AdminLayout.astro:18-20`
- **Szczegóły**: Sekcja `Czego NIE robimy` planu wyklucza `Zarządzanie user_book_access` i `Role management UI`. Implementacja dodaje pełny panel `/admin/users`, który enumeruje użytkowników auth przez klucz service-role, zarządza `user_book_access` i jest linkowany w sidebarze. To sprzeczne z planem i wprowadza service-role do zmiany, która miała działać przez anon-key + `is_admin()`.
- **Poprawka A ⭐ Zalecana**: Usuń całą funkcjonalność user management (UsersTable, users.astro, user-admin.ts, grant.ts, revoke.ts) oraz link z AdminLayout.
  - Siła: Przywraca zgodność z planem i eliminuje ryzyko service-role.
  - Kompromis: Traci wykonaną pracę; trzeba rozwiązać problem widoczności książek na dashboardzie inaczej.
  - Pewność: HIGH — plan jednoznacznie wyklucza ten zakres.
  - Martwy punkt: Nie sprawdzono, czy coś innego zależy od `/admin/users`.
- **Poprawka B**: Zaakceptuj rozszerzenie zakresu jako osobną zmianę i przeprowadź dla niej osobny security review service-role.
  - Siła: Zachowuje funkcjonalność; oddziela ją od S-02.
  - Kompromis: Plan S-02 przestaje być źródłem prawdy; wymaga nowego planu i review.
  - Pewność: MEDIUM — zależy od decyzji produktowej.
  - Martwy punkt: Nie zweryfikowano wymagań bezpieczeństwa dla service-role.
- **Decyzja**: FIXED via Poprawka A + wydzielenie kodu do nowej zmiany `admin-user-book-access-management` (`context/changes/admin-user-book-access-management/change.md`). Usunięto pliki i link z AdminLayout; w src nie pozostały żadne odniesienia do `/admin/users`.

## Ostrzeżenia ⚠️

### F3 — `cover_url` akceptuje niedozwolone schematy URL

- **Ważność**: ⚠️ WARNING
- **Wpływ**: 🏃 LOW — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Bezpieczeństwo i jakość
- **Lokalizacja**: `src/pages/api/admin/books/index.ts:12-15`, `src/pages/api/admin/books/[id].ts:12-15`, render w `src/pages/admin/books/index.astro:47` i `src/pages/dashboard.astro:114`
- **Szczegóły**: `z.string().url()` akceptuje `javascript:`, `data:` i inne schematy. Wartość jest renderowana jako `<img src={cover_url}>`, co otwiera powierzchnię XSS.
- **Poprawka**: Ogranicz `cover_url` do `http:`/`https:` np. `z.string().url().refine(u => u.startsWith('http://') || u.startsWith('https://'))`.
- **Decyzja**: FIXED — dodano `.refine()` w `src/pages/api/admin/books/index.ts` i `[id].ts`; pusty string nadal dozwolony.

### F4 — Brak ochrony CSRF na endpointach admina

- **Ważność**: ⚠️ WARNING
- **Wpływ**: 🔎 MEDIUM — prawdziwy kompromis; trzeba wybrać poziom ochrony
- **Wymiar**: Bezpieczeństwo i jakość
- **Lokalizacja**: Wszystkie `src/pages/api/admin/**` obsługujące POST/DELETE/JSON POST
- **Szczegóły**: Endpointy przyjmują żądania zmieniające stan bez tokenów CSRF, sprawdzania origin/referer ani walidacji `SameSite`. Formularze HTML i globalny delete-button wysyłają cookie-authenticated żądania, co czyni je podatnymi na CSRF.
- **Poprawka**: Dodaj weryfikację nagłówka `Origin`/`Referer` dla wszystkich state-changing admin API routes.
- **Decyzja**: FIXED — guard dodany do 12 handlerów w 8 plikach admin API; zwraca 403 `Invalid origin` dla cross-origin żądań.

### F5 — Strony admina bez lokalnej weryfikacji roli

- **Ważność**: ⚠️ WARNING
- **Wpływ**: 🏃 LOW — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Bezpieczeństwo i jakość / Spójność wzorców
- **Lokalizacja**: Wszystkie `src/pages/admin/*/*.astro` oprócz `users.astro`
- **Szczegóły**: Strony polegają wyłącznie na middleware. `users.astro` dodatkowo sprawdza `Astro.locals.role === 'admin'`. Brak defense-in-depth.
- **Poprawka**: Dodaj `if (Astro.locals.role !== 'admin') return Astro.redirect('/dashboard');` na górze każdej strony admina.
- **Decyzja**: FIXED — guard dodany do 12 stron admina (books, chapters, lessons, exercises: index/new/edit).

### F6 — Aktualizacja exercise + kluczy bez transakcji

- **Ważność**: ⚠️ WARNING
- **Wpływ**: 🔎 MEDIUM — prawdziwy kompromis; plan akceptuje to dla MVP, ale warto załatać
- **Wymiar**: Bezpieczeństwo danych
- **Lokalizacja**: `src/pages/api/admin/exercises/[id].ts:67-91`
- **Szczegóły**: Sekwencja UPDATE → DELETE keys → INSERT keys. Jeśli INSERT zawiedzie po udanym DELETE, exercise zostaje bez kluczy.
- **Poprawka**: Użyj batch insert dla nowych kluczy i wykonaj go przed DELETE (wtedy najwyżej zostaną stare + nowe, nigdy pusto), albo opakuj w RPC/transakcję Supabase.
- **Decyzja**: FIXED — przed usunięciem starych kluczy tworzony jest backup; jeśli insert nowych kluczy zawiedzie, stare klucze są przywracane. Złagodzone też przez batch insert (F7).

### F7 — Klucze odpowiedzi wstawiane pojedynczo

- **Ważność**: ⚠️ WARNING
- **Wpływ**: 🏃 LOW — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Wydajność / Niezawodność
- **Lokalizacja**: `src/pages/api/admin/exercises/index.ts:73-84`, `src/pages/api/admin/exercises/[id].ts:84-91`
- **Szczegóły**: `exercise_keys` wstawiane w pętli `for`. To N+1 writes, a pojedynczy błąd zostawia częściowy zestaw kluczy.
- **Poprawka**: Zbierz tablicę obiektów i wstaw jednym wywołaniem `supabase.from('exercise_keys').insert([...])`.
- **Decyzja**: FIXED — pętle zastąpione batch insertem w `src/pages/api/admin/exercises/index.ts` i `[id].ts`.

### F8 — `decodeURIComponent` może rzucić URIError

- **Ważność**: ⚠️ WARNING
- **Wpływ**: 🏃 LOW — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Niezawodność
- **Lokalizacja**: `src/pages/admin/books/new.astro:14`, `src/pages/admin/books/[id]/edit.astro:15`, `src/pages/admin/chapters/new.astro:18`, `src/pages/admin/chapters/[id]/edit.astro:18`, `src/pages/admin/lessons/new.astro:18`, `src/pages/admin/lessons/[id]/edit.astro:18`
- **Szczegóły**: Parametry błędów są dekodowane bezpośrednio w JSX. Nieprawidłowe percent-encoding (np. `%ZZ`) powoduje URIError i 500.
- **Poprawka**: Opakuj dekodowanie w `try/catch` lub dodaj helper, który przy błędzie zwraca surowy string.
- **Decyzja**: FIXED — helper `safeDecodeURIComponent` dodany do 6 stron formularzy admina; błąd dekodowania zwraca surowy string zamiast 500.

### F9 — Dashboard studenta nie pokazuje nowo utworzonych książek

- **Ważność**: ⚠️ WARNING
- **Wpływ**: 🔎 MEDIUM — sukces kryterium fazy 2 zależy od tego
- **Wymiar**: Kryteria sukcesu
- **Lokalizacja**: `src/pages/dashboard.astro:28-38`
- **Szczegóły**: Dashboard filtruje książki przez `user_book_access`. Plan fazy 2 wymagał, aby nowo utworzona książka była widoczna bez seedowania `user_book_access`.
- **Poprawka**: Zmień query dashboardu, aby pobierać `books` bezpośrednio (z RLS), lub zapewnij domyślny dostęp dla wszystkich studentów.
- **Decyzja**: FIXED — nowa migracja `supabase/migrations/20260629000000_open_book_access_for_students.sql` otwiera dostęp do książek/rozdziałów/lekcji dla wszystkich zalogowanych studentów (MVP); dashboard pobiera teraz `books` bezpośrednio. Błąd typu w `dashboard.astro:36` zniknął.

### F10 — Błędy DB na listach admina nie są wyświetlane

- **Ważność**: ⚠️ WARNING
- **Wpływ**: 🏃 LOW — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Spójność wzorców / Niezawodność
- **Lokalizacja**: `src/pages/admin/books/index.astro:21`, `src/pages/admin/chapters/index.astro:19-20`, `src/pages/admin/lessons/index.astro:30`, `src/pages/admin/exercises/index.astro:30`
- **Szczegóły**: `Dashboard.astro` przechwytuje błędy DB i renderuje `<ServerError>`. Listy admina albo tylko `console.error`, albo destrukturyzują `data` bez sprawdzania `error`, co skutkuje pustymi listami.
- **Poprawka**: Sprawdź `error` z każdego zapytania i wyświetl `<ServerError>` zgodnie ze wzorcem dashboardu.
- **Decyzja**: FIXED — `pageError` + `<ServerError>` dodane do 4 stron list admina.

## Obserwacje

### O1 — Nieplanowane zarządzanie użytkownikami (powiązane z F2)

- **Wymiar**: Dyscyplina zakresu
- **Lokalizacja**: patrz F2
- **Szczegóły**: Pełny feature user management został dodany pomimo wyraźnego wykluczenia z planu. Decyzja wymaga rozstrzygnięcia w F2.

### O2 — Mieszane kontrakty odpowiedzi w formularzach natywnych

- **Wymiar**: Spójność wzorców
- **Lokalizacja**: `src/pages/api/admin/books/index.ts`, `src/pages/api/admin/chapters/index.ts`, `src/pages/api/admin/lessons/index.ts`
- **Szczegóły**: Endpointy formularzy zwracają JSON 403/503 dla błędów auth/config, ale redirect 302 dla błędów walidacji/DB. Native form nie może sensownie wyrenderować gałęzi JSON.
- **Rekomendacja**: Używaj `Response.redirect('/admin/...?error=...')` konsekwentnie dla wszystkich ścieżek błędów w endpointach natywnych formularzy.

### O3 — Ręcznie robione przyciski zamiast `<Button>`

- **Wymiar**: Spójność wzorców
- **Lokalizacja**: `src/pages/admin/books/new.astro`, `src/pages/admin/books/[id]/edit.astro`, `src/pages/admin/chapters/new.astro`, `src/pages/admin/chapters/[id]/edit.astro`, `src/pages/admin/lessons/new.astro`, `src/pages/admin/lessons/[id]/edit.astro`
- **Szczegóły**: Przyciski submit/cancel mają ręcznie wpisane klasy Tailwind zamiast używać istniejącego komponentu `src/components/ui/button.tsx`.
- **Rekomendacja**: Zastąp je komponentami `<Button variant="default">` i `<Button variant="outline">`.

### O4 — Natywne kontrolki w React islands zamiast shadcn

- **Wymiar**: Spójność wzorców
- **Lokalizacja**: `src/components/admin/ExerciseForm.tsx`, `src/components/admin/MarkdownEditor.tsx`
- **Szczegóły**: ExerciseForm używa `<select>`, `<input>`, `<textarea>`, a MarkdownEditor używa `<textarea>`. Plan fazy 1 instaluje shadcn `Select`, `Input`, `Textarea`, `Label`.
- **Rekomendacja**: Oceń migrację do shadcn w islands; nie blokuje release.

### O5 — Brak segmentu "Rozdziały" w breadcrumb lekcji

- **Wymiar**: Zgodność z planem
- **Lokalizacja**: `src/pages/admin/lessons/index.astro:19-22`
- **Szczegóły**: Plan wymaga breadcrumbu `Książki → {book.title} → Rozdziały → {chapter.title}`. Brakuje segmentu `Rozdziały`.
- **Rekomendacja**: Dodaj link "Rozdziały" prowadzący do `/admin/chapters?book_id={book.id}`.

### O6 — Duplikacja walidacji UUID

- **Wymiar**: Spójność wzorców
- **Lokalizacja**: `src/pages/api/admin/users/[id]/grant.ts:7`, `src/pages/api/admin/users/[id]/revoke.ts:7`
- **Szczegóły**: Endpointy grant/revoke definiują własny regex UUID zamiast importować `uuidSchema` z `@/lib/utils`.
- **Rekomendacja**: Użyj `uuidSchema` z `@/lib/utils`.

### O7 — Niepoprawna struktura folderów dla users API

- **Wymiar**: Spójność wzorców
- **Lokalizacja**: `src/pages/api/admin/users.ts`, `src/pages/api/admin/users/[id]/grant.ts`, `src/pages/api/admin/users/[id]/revoke.ts`
- **Szczegóły**: Inne zasoby używają `resource/index.ts` + `resource/[id].ts`. Users jest płaskie.
- **Rekomendacja**: Przenieś `users.ts` do `users/index.ts` (jeśli feature zostaje).

## Historia decyzji z poprzednich przeglądów

| Ustalenie | Decyzja |
|---|---|
| Zod v4 record schema | FIXED + ACCEPTED-AS-RULE |
| Brak `prerender = false` w API routes S-02 | FIXED |
| XSS przez inline `confirm()` w tytułach | FIXED — utworzono DeleteButton.astro |
| XSS w treści lekcji renderowanej studentowi | FIXED via sanitizeHtml + filterXSS |
| Link `/admin/users` w sidebarze | ACCEPTED w poprzednim review; do ponownej oceny w świetle F2 |
| `ServerError` z `client:load` | FIXED |
| `'use client'` w `label.tsx` | FIXED |
| Walidacja UUID w `params.id` | FIXED |
| Content-Type w odpowiedziach JSON | FIXED |

## Podsumowanie

Następne fixy do rozważenia (wg priorytetu):
1. **F1** — Sanityzacja podglądu MarkdownEditor (krytyczny XSS).
2. **F2** — Decyzja o usunięciu/zaakceptowaniu zarządzania użytkownikami (krytyczny scope drift).
3. **F3** — Ograniczenie `cover_url` do http(s).
4. **F4** — Ochrona CSRF na endpointach admina.
5. **F5** — Lokalna weryfikacja roli admina na stronach.
6. **F6** — Bezpieczna transakcyjność przy update exercise + keys.
7. **F7** — Batch insert kluczy.
8. **F8** — Ochrona `decodeURIComponent` przed URIError.
9. **F9** — Dashboard widzi nowe książki bez `user_book_access`.
10. **F10** — Obsługa błędów DB na listach admina.
