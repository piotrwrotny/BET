---
date: 2026-06-26T00:00:00+02:00
researcher: AI Researcher
git_commit: 4af4d5e7b81389b31fffd4fcb964d8e8c709b6dc
branch: dev
repository: BET
topic: "S-03 admin-user-and-access-mgmt implementation using TanStack Table, CASL, and Supabase Auth Admin API"
tags: [research, codebase, admin, user-management, access-control, tanstack-table, casl, supabase]
status: complete
last_updated: 2026-06-26
last_updated_by: AI Researcher
last_updated_note: "Dodano badania uzupełniające dla multi-book assignment UX/API"
---

# Badanie: Implementacja S-03 admin-user-and-access-mgmt

**Data**: 2026-06-26
**Badacz**: AI Researcher
**Git Commit**: [4af4d5e](https://github.com/piotrwrotny/BET/commit/4af4d5e7b81389b31fffd4fcb964d8e8c709b6dc)
**Gałąź**: dev
**Repozytorium**: [BET](https://github.com/piotrwrotny/BET)

## Pytanie badawcze

Jak zaimplementować zarządzanie użytkownikami i dostępem do książek (S-03) w projekcie BET, wykorzystując wskazane biblioteki: **TanStack Table v8**, **CASL** oraz **Supabase Auth Admin API**? Jakie są luki w obecnym kodzie i jakie wzorce należy zastosować?

## Podsumowanie

1. **Bieżący stan jest solidny** — middleware i RLS już obsługują role (`admin`/`student`) oraz kontrolę dostępu do książek (`user_book_access`).
2. **Kluczowa luka**: brak `service_role` klienta — admin nie może listować wszystkich użytkowników Supabase Auth. Wymagane dodanie `SUPABASE_SERVICE_ROLE_KEY`.
3. **TanStack Table v8** pasuje idealnie jako React island na stronie `/admin/users` — zastąpi surowe tabele HTML wzorem shadcn/ui `DataTable`.
4. **CASL** jest opcjonalny ale korzystny — deklaratywnie ukrywa akcje w React islands (np. przycisk "Odbierz dostęp").
5. **Supabase Auth Admin API** (`supabase.auth.admin.listUsers()`) musi być wywoływane tylko serwerowo (Astro API routes) z `service_role` — nigdy z przeglądarki.
6. **Model OQ-1 rozstrzygnięty**: self-service signup + admin przegląda listę oczekujących i nadaje książki.

## Szczegółowe ustalenia

### 1. Bieżący stan autentykacji i autoryzacji

#### Middleware (`src/middleware.ts:1-41`)
- Rozwiązuje użytkownika przez `supabase.auth.getUser()` i rolę przez zapytanie do `user_roles`.
- Ustawia `Astro.locals.user` i `Astro.locals.role` (`admin` | `student` | `null`).
- Przekierowuje niezalogowanych z `/admin/*` → `/auth/signin`, nie-adminów z `/admin/*` → `/dashboard`.
- **Obserwacja**: Brak cache'owania roli w sesji — zapytanie do `user_roles` wykonywane na każde żądanie.

#### `src/env.d.ts:1-7`
- Typ `App.Locals` definiuje `user: User | null` i `role: "admin" | "student" | null`.

#### `src/lib/supabase.ts:1-25`
- `createClient` używa `SUPABASE_URL` + `SUPABASE_KEY` (anon key) przez `@supabase/ssr`.
- **Brak**: żadnej inicjalizacji klienta `service_role` — wszystkie operacje przechodzą przez RLS.

#### API auth (`src/pages/api/auth/`)
- **signup.ts**: `supabase.auth.signUp()` + trigger DB `handle_new_user` wstawia `role='student'`.
- **signin.ts**: `supabase.auth.signInWithPassword()`.
- **signout.ts**: `supabase.auth.signOut()`.
- **Brak**: walidacji Zod na wejściu (formData bez sprawdzania typów).

#### API routes admin (`src/pages/api/admin/*`)
- Każdy endpoint sprawdza `locals.role !== 'admin'` → 403.
- Używają standardowego SSR clienta (anon key + sesja admina), co działa bo RLS pozwala adminowi na CUD.

### 2. Wzorce UI w panelu admina

#### Layout (`src/layouts/AdminLayout.astro:1-99`)
- Sidebar z twardo zakodowaną nawigacją (`navLinks` array): Książki, Rozdziały, Lekcje, Ćwiczenia.
- Aktywny stan przez `pathname.startsWith(href)`.
- **Brak**: linku do zarządzania użytkownikami — trzeba dodać.

#### Listy (np. `src/pages/admin/books/index.astro:1-95`)
- **Server-side fetch** w frontmatter Astro.
- **Surowa HTML `<table>`** ze stylami Tailwind (`border-b`, `hover:bg-muted/20`).
- Delete przez inline `onclick` z `fetch(DELETE)` + `confirm()`.
- **Brak**: paginacji, sortowania, filtrowania — wszystko renderowane serwerowo.

#### Formularze
- **Proste** (książki, rozdziały): `method='post'` do API, redirect na sukces/błąd.
- **Złożone** (ćwiczenia): React island (`ExerciseForm.tsx`) z `client:load`, fetch POST z JSON.

#### shadcn/ui komponenty dostępne
- `Input`, `Label`, `Textarea`, `Select`, `Button`.
- **Brak**: `DataTable` (komponent shadcn/ui z TanStack Table) — wymaga dodania.

### 3. Schemat bazy danych dla user management

#### `user_roles` (`supabase/migrations/20260625184555_init.sql:48-52`)
```sql
CREATE TABLE public.user_roles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.user_role NOT NULL DEFAULT 'student',
  created_at timestamptz NOT NULL DEFAULT now()
);
```
- RLS: SELECT (własny lub admin), INSERT/UPDATE/DELETE (tylko admin).
- Trigger `handle_new_user` wstawia `role='student'` dla każdego nowego `auth.users`.

#### `user_book_access` (`supabase/migrations/20260625184555_init.sql:67-74`)
```sql
CREATE TABLE public.user_book_access (
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id uuid REFERENCES public.books(id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, book_id)
);
CREATE INDEX user_book_access_book_id_idx ON public.user_book_access(book_id);
```
- RLS: SELECT (własny lub admin), INSERT/UPDATE/DELETE (tylko admin).
- Indeks `book_id` wspiera zapytania admina typu "kto ma dostęp do tej książki".

#### Funkcje pomocnicze RLS
- `is_admin()` → boolean (sprawdza `user_roles.role = 'admin'`).
- `has_book_access(_book_id)` → boolean.
- `has_lesson_access(_lesson_id)` → boolean.
- `has_exercise_access(_exercise_id)` → boolean.

#### Luki w schemacie
- **Brak audit trail** — nie wiadomo kto i kiedy nadał/odebrał dostęp.
- **Brak soft-delete** na `user_book_access` — hard DELETE.
- **Brak pola `status`/`invited`** — nie da się oznaczyć "oczekującego" studenta bez książki.

### 4. TanStack Table v8 (Context7)

#### Instalacja i użycie
```bash
npm install @tanstack/react-table
```
shadcn/ui ma gotowy komponent `DataTable` bazujący na TanStack Table v8.

#### Server-side manual mode
Dla Astro SSR (serwer fetchuje wszystkie dane, React island tylko renderuje):
- Ustawić `manualPagination: true`, `manualSorting: true`, `manualFiltering: true`.
- Pass `rowCount` z serwera.
- Użyć `useReactTable` z `getCoreRowModel`.

```tsx
const table = useReactTable({
  data,
  columns,
  getCoreRowModel: getCoreRowModel(),
  manualSorting: true,
  manualFiltering: true,
  manualPagination: true,
  rowCount: totalCount,
});
```

**Kontekst**: Ponieważ Astro frontmatter fetchuje wszystkie dane serwerowo, TanStack Table w BET będzie działać w trybie **display-only** (bez server-client sync) — sortowanie/filtrowanie można zrobić przez full page reload z query params, lub przez client-side na już załadowanych danych (jeśli lista jest krótka).

#### Dlaczego pasuje do BET
- shadcn/ui oficjalnie wspiera DataTable: [shadcn/ui Data Table](https://ui.shadcn.com/docs/components/data-table).
- Nie wymaga dodatkowych zależności poza `@tanstack/react-table`.
- Można opakować w React island (`client:load`) na stronie Astro.

### 5. CASL (@casl/ability + @casl/react)

#### Instalacja
```bash
npm install @casl/ability @casl/react
```

#### Wzorzec użycia
**Definicja abilities** (np. w `src/lib/abilities.ts`):
```ts
import { AbilityBuilder, createMongoAbility } from "@casl/ability";

export function defineAbilityFor(role: "admin" | "student") {
  const { can, cannot, build } = new AbilityBuilder(createMongoAbility);
  if (role === "admin") {
    can("manage", "all");
  } else {
    can("read", "Book");
    cannot("manage", "User");
  }
  return build();
}
```

**Provider w React island**:
```tsx
import { AbilityProvider } from "@casl/react";
const ability = defineAbilityFor(role);
<AbilityProvider ability={ability}>
  <UsersTable />
</AbilityProvider>
```

**Użycie w komponentach**:
```tsx
import { Can } from "@casl/react";
<Can I="grant" a="BookAccess">
  <button>Przyznaj dostęp</button>
</Can>
```

#### Dlaczego pasuje do BET
- Deklaratywne ukrywanie akcji w React islands (np. "Przyznaj dostęp", "Odbierz dostęp", "Zmień rolę").
- Cienka warstwa UX, której RLS nie zapewnia (RLS blokuje operacje na serwerze, CASL ukrywa przyciski w UI).
- W BET role są proste (admin/student), więc CASL jest opcjonalne ale przydatne dla czytelności.

### 6. Supabase Auth Admin API (Context7)

#### Metody
```ts
// Inicjalizacja serwerowego klienta z service_role
import { createClient } from "@supabase/supabase-js";
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Listowanie użytkowników
const { data, error } = await supabaseAdmin.auth.admin.listUsers();

// Tworzenie użytkownika
const { data, error } = await supabaseAdmin.auth.admin.createUser({
  email: "user@email.com",
  password: "password",
  email_confirm: true,
});

// Aktualizacja
const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
  userId,
  { email: "new@email.com" }
);

// Usunięcie
const { data, error } = await supabaseAdmin.auth.admin.deleteUser(userId);
```

#### Wymagania bezpieczeństwa
- `SUPABASE_SERVICE_ROLE_KEY` **musi być utrzymany wyłącznie po stronie serwera**.
- W BET: użyć go tylko w Astro API routes (`src/pages/api/admin/users.ts`).
- Nigdy nie wysyłać do przeglądarki ani używać w middleware.

#### Co trzeba dodać w BET
1. Nowa zmienna środowiskowa: `SUPABASE_SERVICE_ROLE_KEY` (`.env`, `.dev.vars`, GitHub secrets).
2. Funkcja `createAdminClient()` w `src/lib/supabase.ts` (lub osobny plik) tworząca klienta z `service_role`.
3. Nowe API route: `GET /api/admin/users.ts` (listUsers + join z `user_roles` i `user_book_access`).
4. Nowe API route: `POST /api/admin/users/[id]/grant.ts` (INSERT `user_book_access`).
5. Nowe API route: `DELETE /api/admin/users/[id]/revoke.ts` (DELETE `user_book_access`).

## Odniesienia do kodu

- `src/middleware.ts:1-41` — Rozwiązywanie roli i ochrona `/admin`
- `src/env.d.ts:1-7` — Typy `Locals.user` i `Locals.role`
- `src/lib/supabase.ts:1-25` — Fabryka SSR clienta (brak service_role)
- `src/layouts/AdminLayout.astro:14-19` — Nawigacja admina (brak linku do użytkowników)
- `src/pages/admin/books/index.astro:35-91` — Wzorzec surowej tabeli HTML
- `src/pages/api/admin/books/index.ts:1-55` — Wzorzec API admina (Zod + role check)
- `supabase/migrations/20260625184555_init.sql:48-74` — `user_roles` i `user_book_access`
- `supabase/migrations/20260625184555_init.sql:249-264` — Trigger `handle_new_user`
- `supabase/migrations/20260625184555_init.sql:281-332` — RLS policies dla `user_roles` i `user_book_access`

## Wnioski architektoniczne

### Wzorzec Layer-Cake autoryzacji w BET
1. **Middleware** — gate na poziomie route (`/admin` → redirect jeśli nie admin).
2. **API routes** — gate na poziomie endpointu (`locals.role !== 'admin'` → 403).
3. **RLS** — gate na poziomie bazy danych (`is_admin()` w policies).
4. **CASL (propozycja)** — gate na poziomie UI (ukryj przyciski nieautoryzowane).

To jest solidny, redundantny model — awaria na jednej warstwie jest zabezpieczona przez następną.

### Service Role — jedyny sposób na listowanie użytkowników
Supabase `auth.users` jest chronione RLS na poziomie platformy. Zwykły SSR client (anon key + sesja) nie może listować wszystkich użytkowników. Jedyny sposób to `createClient(url, service_role_key)` po stronie serwera.

### Astro + React islands — wzorzec dla S-03
- **Astro frontmatter**: Fetchuj dane serwerowo (listUsers + user_roles + user_book_access).
- **React island**: TanStack Table jako `client:load` do renderowania tabeli + interakcji (sortowanie client-side).
- **Formularze**: Server-driven POST do API routes (jak obecne formularze książek).

### Ograniczenia obecne
- Brak paginacji na stronach admina — `user_book_access` i `user_roles` są małe na start, ale przy skalowaniu trzeba dodać.
- Brak wyszukiwania użytkowników — `Supabase Auth Admin API` wspiera filtrowanie per-page, ale nie jest implementowane przez RLS.
- Brak możliwości edycji roli przez admin UI — wymaga UPDATE `user_roles` (RLS pozwala adminowi).

## Kontekst historyczny

- `context/foundation/roadmap.md` — OQ-1 rozstrzygnięte (self-service signup + oczekiwanie na książkę). S-03 zmienione z `blocked` na `proposed`.
- `context/changes/bet-data-foundation/` — Migracja F-01 utworzyła schemat `user_roles`, `user_book_access`, RLS i trigger.
- `context/changes/admin-content-creation/` — Wzorce UI admina (strony, formularze, API) ustalone w S-02.

## Powiązane badania

- `context/changes/bet-data-foundation/research.md` — Badanie schematu bazy danych i RLS (nie istnieje osobno, ale zawarte w planie).
- `context/foundation/prd.md` — Definicja FR-001, FR-002, FR-003.

## Otwarte pytania

1. **Czy dodać audit log** (tabela `audit_log` z kto/kiedy/co)? PRD nie wymaga, ale businessowo przydatne.
2. **Czy wprowadzić soft-delete na `user_book_access`** zamiast hard DELETE? Prostsze z punktu widzenia RLS, ale wymaga kolumny `revoked_at`.
3. **Czy admin może zmieniać hasła studentów?** Auth Admin API to umożliwia (`updateUserById`), ale czy to wymaganie FR-002?
4. **Czy lista "oczekujących" to po prostu wszyscy studenci bez `user_book_access`, czy oddzielny status?** OQ-1 sugeruje pierwsze.

## Badania uzupełniające 2026-06-26T15:10:00+02:00

### Problem potwierdzony w kodzie

- `src/components/admin/UsersTable.tsx:61-70` nadpisuje `row.books` na tablicę z **jedną** książką po każdym wyborze.
- `src/components/admin/UsersTable.tsx:154` UI korzysta z `row.books[0]` jako pojedynczej wartości `Select`.
- `src/pages/api/admin/users/[id]/revoke.ts:31` usuwa **wszystkie** książki użytkownika (`delete().eq("user_id", ...)`) zamiast konkretnej pary `(user_id, book_id)`.

To daje efekt: wybór nowej książki "chwilowo" wygląda jak single-book, a pełna lista wraca dopiero po refetch/odświeżeniu.

### Context7 + web research (Exa fallback)

W tej sesji nie było aktywnego narzędzia Exa, więc użyto `web_search` jako zamiennika + Context7 do weryfikacji API bibliotek.

#### 1) Shadcn UI Combobox (multiple) — REKOMENDACJA dla BET

- Źródło: Context7 `/shadcn-ui/ui`.
- Potwierdzony wzorzec: `Combobox` z `multiple`, chips/tags i wyszukiwaniem.
- Dlaczego pasuje:
  - zgodne z istniejącym stackiem shadcn + Tailwind,
  - brak ciężkiego dodatkowego dependency,
  - naturalny UX do wielu książek per user.

#### 2) React Select (`isMulti`) — dobra opcja, szybka implementacja

- Źródło: Context7 `/websites/react-select` + web docs.
- Potwierdzone: `isMulti`, kontrolowany `value`, stabilny `onChange` (tablica wartości).
- Tradeoff: dodatkowy dependency i stylowanie poza obecnym wzorcem shadcn.

#### 3) Downshift (`useCombobox` + `useMultipleSelection`) — maksymalna kontrola

- Źródło: Context7 `/downshift-js/downshift`.
- Potwierdzone: prymitywy do wielokrotnego wyboru + usuwania tagów.
- Tradeoff: najwięcej kodu i logiki a11y do utrzymania.

#### 4) TanStack Query do optimistic update + rollback (opcjonalne)

- Źródło: Context7 `/tanstack/query`.
- Potwierdzone: `onMutate` + rollback w `onError` + `invalidateQueries`.
- Wniosek: przydatne, jeśli panel users urośnie; dla MVP można zostać przy local state + refetch.

### Najlepsze podejście architektoniczne dla tej funkcji

1. **Model danych zostaje many-to-many** (`user_book_access`), bez zmian schematu.
2. **UI zmienia się z single-select na multi-assign**:
   - pokazuj wszystkie przypisane książki jako chips,
   - dodawanie: wybór kolejnej książki z combobox,
   - usuwanie: akcja „x” na konkretnym chipie.
3. **API revoke musi być granularne**:
   - `DELETE /api/admin/users/:id/revoke?book_id=<uuid>`
   - usuwa tylko `(user_id, book_id)`, nie całość.
4. **Optimistic UI musi append/remove, nie replace**:
   - add: `books = [...books, newBook]` jeśli nie istnieje,
   - remove: `books = books.filter(b => b.book_id !== bookId)`.

### Wniosek implementacyjny

Obecny bug nie wynika z RLS ani Supabase, tylko z kontraktu UI/API ustawionego jako single-book. Najbezpieczniejsza korekta dla BET: **shadcn multi-combobox + granular revoke(book_id)**, bez zmiany schematu DB.
