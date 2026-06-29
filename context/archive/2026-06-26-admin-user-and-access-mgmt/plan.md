# Plan wdrożenia S-03: admin-user-and-access-mgmt

## Przegląd

Admin zarządza kontami studentów i ich dostępem do książek (FR-002, FR-003). Student rejestruje się samodzielnie (FR-001) i czeka na nadanie książki. Admin przegląda listę użytkowników, filtruje oczekujących bez książek i jednym kliknięciem przyznaje lub odbiera dostęp.

## Analiza stanu obecnego

- **Schema DB gotowe**: `user_roles` z RLS (admin/student), `user_book_access` z RLS, trigger `handle_new_user` nadaje `role='student'` na signup.
- **Middleware** (`src/middleware.ts:1-41`): rozwiązuje `locals.role` i chroni `/admin/*` (redirect nie-adminów → `/dashboard`).
- **Admin UI** (`src/layouts/AdminLayout.astro:14-19`): sidebar z linkami do Książki/Rozdziały/Lekcje/Ćwiczenia. **Brak** linku do użytkowników.
- **Wzorce UI admina** (`src/pages/admin/books/index.astro:35-91`): surowa HTML `<table>` serwerowo renderowana w Astro frontmatter, delete przez inline `onclick` + `fetch()`.
- **API admina** (`src/pages/api/admin/books/index.ts:1-55`): `locals.role !== 'admin'` → 403, Zod walidacja, form-data parsing, redirect na error/success.
- **Kluczowa luka**: Brak `SUPABASE_SERVICE_ROLE_KEY` i klienta admina. Standardowy SSR client (anon) nie może listować `auth.users` — RLS Supabase Auth zwraca tylko bieżącego użytkownika.
- **Luka UI**: Brak komponentu `DataTable` w shadcn/ui — trzeba dodać `@tanstack/react-table`.

## Pożądany stan końcowy

Admin otwiera `/admin/users` i widuje:
1. Tabelę wszystkich studentów (email, rola, przypisane książki, data rejestracji).
2. Filtr "Oczekujący" pokazujący studentów bez wpisów w `user_book_access`.
3. Inline shadcn/ui Select w wierszu do wyboru książki — zmiana przyznaje dostęp (POST).
4. Przycisk "Odbierz" obok studenta z książką — usuwa dostęp (DELETE).
5. Weryfikacja: nie-admin na `/admin/users` trafia na `/dashboard`.

## Czego NIE robimy

- Promowanie/demotion ról (admin ↔ student).
- Usuwanie / blokowanie kont studentów.
- Wysyłanie emaili do studentów o nadaniu książki.
- Paginacja serwerowa listy użytkowników — wystarczy client-side sort na danych z serwera.
- Wyszukiwanie globalne po email (client-side filter wystarcza dla MVP).
- Audit log zmian dostępu.
- Soft-delete (`revoked_at`) na `user_book_access` — używamy hard DELETE.

## Podejście do implementacji

Reuzyjemy wzorce z S-02 (admin-content-creation):
- Astro frontmatter fetchuje dane serwerowo.
- API routes ochraniane `locals.role !== 'admin'` → 403.
- Zod v4 (już w deps) waliduje inputy.
- React island (`client:load`) tylko dla interaktywnej tabeli z TanStack Table.

Nowy element: **serwerowy klient z `service_role`** — izolowany do API routes, nigdy nie wysyłany do przeglądarki.

## Faza 1: Backend — service_role, API routes, AdminLayout nav

### Przegląd
Dostarcza możliwość serwerowego listowania użytkowników (bypass RLS auth.users) i endpointy do przyznawania/odbierania dostępu. Aktualizuje nawigację admina.

### Wymagane zmiany:

#### 1. Zmienne środowiskowe i konfiguracja

**Pliki**: `.env.example`, `.dev.vars` (if exists), `wrangler.jsonc` / Cloudflare secrets

**Cel**: `SUPABASE_SERVICE_ROLE_KEY` musi być dostępny po stronie serwera dla API routes.

**Kontrakt**: W dev (`npm run dev`) Astro używa `.dev.vars`. W Cloudflare Workers — `wrangler secret put SUPABASE_SERVICE_ROLE_KEY`. W CI (GitHub Actions) — secret w repozytorium. NIGDY nie commitować wartości.

#### 2. Serwerowy klient admina

**Plik**: `src/lib/supabase.ts`

**Cel**: Dodać `createAdminClient()` tworzącego `@supabase/supabase-js` client z `SUPABASE_SERVICE_ROLE_KEY` (standardowy, nie SSR — bez cookie management).

**Kontrakt**: Funkcja synchroniczna, nie przyjmuje headers/cookies. Używana WYŁĄCZNIE w `src/pages/api/admin/**/*.ts`. Wyrzuca jeśli `SUPABASE_SERVICE_ROLE_KEY` nie jest ustawiony.

```ts
// Fragment — nowa funkcja w src/lib/supabase.ts
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const url = import.meta.env.SUPABASE_URL;
  const key = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase admin credentials");
  return createSupabaseClient(url, key);
}
```

#### 3. API route — lista użytkowników

**Plik**: `src/pages/api/admin/users.ts`

**Cel**: Zwraca wszystkich użytkowników Supabase Auth + join z `user_roles` i `user_book_access`.

**Kontrakt**: `GET` handler. Zwraca JSON: `{ users: Array<{ id, email, role, books: Array<{ book_id, title, granted_at }> }> }`. Role pobierane z `user_roles` (RLS pozwala adminowi SELECT all). Książki pobierane z `user_book_access JOIN books`. Użytkownicy bez książek mają `books: []`.

**Szczegół**: `listUsers()` zwraca paginację — dla MVP akceptujemy domyślny limit Supabase (np. 50) i zakładamy że lista jest krótka. Jeśli `users.length > 50`, log warning.

#### 4. API route — przyznawanie dostępu

**Plik**: `src/pages/api/admin/users/[id]/grant.ts`

**Cel**: Umożliwia adminowi przypisanie książki do studenta.

**Kontrakt**: `POST` handler. Input: JSON `{ book_id: string }`. Validacja Zod: `book_id` musi być UUID. Rola check: `locals.role !== 'admin'` → 403. INSERT do `user_book_access(user_id, book_id)` przez standardowy SSR client (nie admin client — admin ma RLS na INSERT). Zwraca `{ ok: true }` lub `{ error: string }`.

#### 5. API route — odbieranie dostępu

**Plik**: `src/pages/api/admin/users/[id]/revoke.ts`

**Cel**: Umożliwia adminowi odebranie książki studentowi.

**Kontrakt**: `DELETE` handler. Input: brak — usuwa WSZYSTKIE wpisy `user_book_access` dla danego `user_id`. Albo, jeśli decyzja: usuwa konkretną parę `(user_id, book_id)` — wtedy `DELETE` z query param `?book_id=...`. **Decyzja z pytań**: przyjmujemy model "1 książka per student" w MVP → DELETE WSZYSTKICH wpisów dla user_id. Zwraca `{ ok: true }`.

#### 6. Aktualizacja AdminLayout

**Plik**: `src/layouts/AdminLayout.astro`

**Cel**: Dodanie linku "Użytkownicy" do `navLinks` array.

**Kontrakt**: Dodaj `{ href: "/admin/users", label: "Użytkownicy" }` do `navLinks` (line 14-19 w obecnym pliku).

### Kryteria sukcesu:

#### Weryfikacja automatyczna:
- `npm run lint` przechodzi bez błędów.
- `npm run build` przechodzi.
- `GET /api/admin/users` zwraca JSON z listą użytkowników (test ręczny w przeglądarce jako admin).
- `POST /api/admin/users/[id]/grant` z `book_id` tworzy wiersz w `user_book_access`.
- `DELETE /api/admin/users/[id]/revoke` usuwa wiersz(e) z `user_book_access`.
- Nie-admin dostaje 403 na wszystkich `/api/admin/users/*` routes.

#### Weryfikacja ręczna:
- AdminLayout sidebar pokazuje link "Użytkownicy".
- Kliknięcie przechodzi do `/admin/users` (strona jeszcze nie istnieje, ale link działa).

---

## Faza 2: Frontend — strona /admin/users z TanStack Table + inline select

### Przegląd
Dostarcza widok tabeli studentów z możliwością sortowania kolumn, filtrowania "oczekujących" i inline przydzielania książek.

### Wymagane zmiany:

#### 1. Instalacja zależności

**Cel**: TanStack Table v8 do React island.

**Kontrakt**: `npm install @tanstack/react-table`. shadcn/ui `DataTable` komponent wymaga ręcznego dodania (`npx shadcn@latest add table` lub skopiowanie z registry).

#### 2. Strona `/admin/users`

**Plik**: `src/pages/admin/users.astro`

**Cel**: Server-side fetch listy użytkowników + lista książek do wyboru w dropdown.

**Kontrakt**: Astro frontmatter:
1. Sprawdź `locals.role !== 'admin'` → redirect `/dashboard` (redundantny wobec middleware, ale bezpieczny).
2. Fetch `GET /api/admin/users` via `Astro.request` (lub bezpośrednio przez `createAdminClient()` — równoważne).
3. Fetch listę książek z `supabase.from("books").select("id, title")` — potrzebna do dropdown.
4. Serializuj dane jako JSON i przekaż do React island: `<UsersTable users={users} books={books} client:load />`.

**Szczegół**: Nie używamy `createAdminClient()` w frontmatterze `.astro` — strona Astro powinna użyć `fetch()` do własnego API albo SSR clienta do `user_roles` + `user_book_access`. Rezygnacja z `fetch` do API: używamy standardowego `createClient()` do `user_roles` i `user_book_access`, ALE lista użytkowników (email) wymaga `auth.admin.listUsers()` — to musi być w API route.

**Wniosek**: Frontmatter strony Astro musi zrobić `fetch()` do `GET /api/admin/users` (lub inline await w API route handler). Najprostsze: Astro frontmatter importuje logic handler z API route.

Alternatywa: wyciągnąć query logic do `src/lib/services/users.ts` i wywołać z frontmatter oraz z API route.

**Rekomendacja**: Refactor — utwórz `src/lib/services/user-admin.ts` z funkcją `getAllUsersWithAccess()` używającą `createAdminClient()`. Użyj jej zarówno w `src/pages/api/admin/users.ts` (API route) jak i w `src/pages/admin/users.astro` (frontmatter). 

#### 3. Funkcja serwisowa `getAllUsersWithAccess`

**Plik**: `src/lib/services/user-admin.ts` (nowy)

**Cel**: Encapsulate logikę listowania użytkowników z joinem do ról i książek.

**Kontrakt**: `async function getAllUsersWithAccess(): Promise<UserWithAccess[]>` gdzie:
```ts
type UserWithAccess = {
  id: string;
  email: string;
  role: "admin" | "student";
  created_at: string;
  books: Array<{ book_id: string; title: string; granted_at: string }>;
};
```
Używa `createAdminClient().auth.admin.listUsers()`, potem `supabase.from("user_roles").select("*")` (admin widzi wszystkie), potem `supabase.from("user_book_access").select("*, books(id, title)")`.

#### 4. React island `UsersTable`

**Plik**: `src/components/admin/UsersTable.tsx` (nowy)

**Cel**: Interaktywna tabela z TanStack Table.

**Kontrakt**:
- Props: `users: UserWithAccess[]`, `books: { id: string; title: string }[]`.
- Kolumny: Email, Rola (badge), Książki (comma-separated lub "—"), Data rejestracji, Akcje.
- Wiersz z akcją: shadcn/ui `Select` z opcjami: `"—"` + lista książek. Domyślna wartość = `books[0]?.book_id` jeśli ma książkę, inaczej `""`.
- `onValueChange`: fetch POST `/api/admin/users/${user.id}/grant` z `{ book_id }`. Jeśli `""` → fetch DELETE `/api/admin/users/${user.id}/revoke`.
- Stany: `isGranting` (disable Select podczas fetcha), `error` (banner jak w ExerciseForm).
- Sortowanie client-side kliknięciem w nagłówek (TanStack `rowSortingFeature`).
- Filtrowanie "oczekujących": przełącznik (shadcn/ui `Switch` lub tabs) filtrujący `users.filter(u => u.books.length === 0)`.

**Fragment kodu — nieoczywisty kontrakt**:
```tsx
// Inline grant/revoke musi być idempotentny i optymistyczny
const handleGrant = async (userId: string, bookId: string) => {
  if (!bookId) {
    await fetch(`/api/admin/users/${userId}/revoke`, { method: "DELETE" });
  } else {
    await fetch(`/api/admin/users/${userId}/grant`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ book_id: bookId }),
    });
  }
  // Optymistycznie: nie czekamy na reload —
  // ale w MVP akceptujemy reload strony albo stan lokalny
};
```

**Decyzja UX**: Select zmienia książkę → natychmiast fetch (bez confirm). Jeśli error → alert + rollback Select do poprzedniej wartości.

#### 5. Weryfikacja hydration

**Szczegół**: React island (`client:load`) musi dostać dane z Astro frontmatter jako props. Serializacja JSON przez Astro działa automatycznie dla prostych typów. Upewnić się że `created_at` (string ISO) i `books` (array) serializują się poprawnie — tak, JSON obsługuje.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:
- `npm run lint` przechodzi.
- `npm run build` przechodzi (brak błędów SSR/hydration w `UsersTable`).
- Strona `/admin/users` renderuje się bez błędów w konsoli przeglądarki.

#### Weryfikacja ręczna:
- Admin widzi tabelę z emailami studentów.
- Sortowanie kolumn (email, rola, data) działa kliknięciem w nagłówek.
- Przełącznik "Tylko oczekujący" pokazuje tylko studentów bez książki.
- Wybór książki w Select przyznaje dostęp (student widzi książkę na dashboardzie po odświeżeniu).
- Wybór `"—"` w Select odbiera dostęp (książka znika z dashboardu studenta).
- Nie-admin wchodzący na `/admin/users` jest redirectowany do `/dashboard`.

---

## Strategia testowania

### Testy jednostkowe — brak (MVP, main_goal=speed)

### Testy integracyjne — brak (MVP, main_goal=speed)

### Kroki testowania ręcznego:

1. **Setup**: Upewnij się że `SUPABASE_SERVICE_ROLE_KEY` jest ustawiony (`supabase status` pokazuje `service_role key`). W local dev: `supabase status` → skopiuj service_role key do `.dev.vars`.
2. **Admin przepływ**:
   - Zaloguj jako admin → /admin/users widoczne w sidebar.
   - Otwórz `/admin/users` — widzisz listę wszystkich studentów.
   - Filtruj "Oczekujący" — lista zawiera studenta bez książki.
   - Wybierz książkę w Select — toast/alert "Dostęp przyznany".
   - Student loguje się — widzi książkę na dashboardzie.
   - Admin wybiera `"—"` w Select — dostęp odebrany.
   - Student odświeża — książka znika.
3. **RLS**:
   - POST `api/admin/users/[id]/grant` jako student → 403.
   - GET `api/admin/users` jako niezalogowany → redirect do signin.
4. **Edge cases**:
   - Przyznanie tej samej książki 2x → upsert (idempotentne; PK `(user_id, book_id)` blokuje duplikat).
   - Odbieranie dostępu gdy student nie ma książki → 404 lub silent success.

## Uwagi dotyczące wydajności

- `listUsers()` jest po stronie serwera — nie blokujemy UI. Dla <50 studentów czas <200ms.
- Client-side sort TanStack Table na ~50 wierszych jest instant — nie wymaga virtualization.
- Brak paginacji serwerowej: akceptowalne dla MVP, ale przy >100 użytkownikach trzeba dodać.

## Uwagi dotyczące migracji

- Brak migracji SQL — używamy istniejących tabel `user_roles` i `user_book_access`.
- Seed SQL (`supabase/seed.sql`): upewnić się że student w seedzie ma role='student' i trigger to wstawił (już istnieje w F-01).

## Postęp

### Faza 1: Backend

#### Automatyczne
- [x] 1.1 `SUPABASE_SERVICE_ROLE_KEY` dodany do `.dev.vars` i `.env.example` — 2fadf07
- [x] 1.2 `createAdminClient()` w `src/lib/supabase.ts` (lub osobny plik) — 2fadf07
- [x] 1.3 `src/lib/services/user-admin.ts` z `getAllUsersWithAccess()` — 2fadf07
- [x] 1.4 `GET /api/admin/users.ts` zwraca JSON listy użytkowników — 2fadf07
- [x] 1.5 `POST /api/admin/users/[id]/grant.ts` z Zod validation — 2fadf07
- [x] 1.6 `DELETE /api/admin/users/[id]/revoke.ts` — 2fadf07
- [x] 1.7 AdminLayout z linkiem "Użytkownicy" — 2fadf07
- [x] 1.8 `npm run lint` i `npm run build` przechodzą — 2fadf07

#### Ręczne
- [x] 1.9 Admin widzi JSON z `GET /api/admin/users` w przeglądarce — 2fadf07
- [x] 1.10 Nie-admin dostaje 403 na `/api/admin/users` — 2fadf07

### Faza 2: Frontend

#### Automatyczne
- [x] 2.1 `@tanstack/react-table` zainstalowany — 46de5b5
- [x] 2.2 `src/pages/admin/users.astro` renderuje się bez błędów build — 46de5b5
- [x] 2.3 `src/components/admin/UsersTable.tsx` bez błędów TypeScript — 46de5b5
- [x] 2.4 `npm run lint` i `npm run build` przechodzą — 46de5b5

#### Ręczne
- [x] 2.5 Tabela wyświetla email, rolę, książki i datę rejestracji — 46de5b5
- [x] 2.6 Sortowanie kolumn (kliknięcie w nagłówek) działa — 46de5b5
- [x] 2.7 Filtr "Tylko oczekujący" pokazuje studentów bez książki — 46de5b5
- [x] 2.8 Inline Select przyznaje książkę — student widzi ją na dashboardzie — 46de5b5
- [x] 2.9 Inline Select na `"—"` odbiera książkę — książka znika z dashboardu — 46de5b5
- [x] 2.10 Nie-admin redirectowany z `/admin/users` do `/dashboard` — 46de5b5
