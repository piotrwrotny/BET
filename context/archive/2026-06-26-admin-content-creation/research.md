---
date: 2026-06-26T12:30:00+02:00
researcher: claude-sonnet-4.6
git_commit: ba9795b0c7ead5c54adef431828ec7e3faf45c5c
branch: dev
repository: BET
topic: "S-02: admin content creation — books, chapters, lessons, exercises, answer keys"
tags: [research, codebase, admin, forms, rich-text, supabase-storage, rls]
status: complete
last_updated: 2026-06-26
last_updated_by: claude-sonnet-4.6
---

# Badanie: S-02 — Admin Content Creation

**Data**: 2026-06-26T12:30:00+02:00
**Git Commit**: ba9795b0c7ead5c54adef431828ec7e3faf45c5c
**Gałąź**: dev

## Pytanie badawcze

Jaki jest aktualny stan bazy kodu względem S-02 (admin tworzy i porządkuje treści: książki, rozdziały, lekcje, ćwiczenia z kluczami)? Co trzeba zbudować, jakie bazy są już gotowe, jakie są kluczowe decyzje architektoniczne?

## Podsumowanie

**Gotowe — zero pracy:**
- DB schema: wszystkie 5 tabel (`books`, `chapters`, `lessons`, `exercises`, `exercise_keys`) z pełnymi RLS write policies (`is_admin()`) — migration:55–392
- `exercise.type` to enum `public.exercise_type` z 6 wartościami — migration:32–39
- `books.cover_url` pole text (nullable) gotowe — migration:58
- `is_admin()` SECURITY DEFINER function — migration:143–156
- `zod` v4 zainstalowany — `package.json`
- `Button`, `SubmitButton`, `ServerError` gotowe do reuse

**Brakuje:**
- Żadnych stron `/admin/*` — zero adminowych Astro pages ani API routes
- `/admin` NIE jest w `PROTECTED_ROUTES` — middleware nie blokuje
- Brak roli guard per-page (brak wzorca `role === 'admin'` na żadnej istniejącej stronie)
- Brak rich text editora — `marked` tylko server-side render, brak edytora klienta
- Brak shadcn form primitives (Input, Textarea, Select, Checkbox, Label)
- Brak Supabase Storage bucket dla okładek
- Brak admin layout (sidebar/nav)

## Szczegółowe ustalenia

### 1. Middleware i ochrona tras

**Plik**: `src/middleware.ts:4`
```ts
const PROTECTED_ROUTES = ["/dashboard", "/lessons"];
```
`/admin` nie jest chronione. Wzorzec middleware: `startsWith` + redirect → `/auth/signin` jeśli brak usera.

**Plik**: `src/env.d.ts:1-6`
```ts
interface Locals { user: User | null; role: 'admin' | 'student' | null; }
```
`role` jest już w `Locals` — wystarczy dodać `/admin` do PROTECTED_ROUTES i sprawdzać `role === 'admin'` per-page (redirect 403 → /dashboard).

**Opcje implementacji role guard:**
- A) Middleware: rozszerzyć o blok `if (path.startsWith('/admin') && role !== 'admin') redirect`
- B) Per-page: `if (Astro.locals.role !== 'admin') return Astro.redirect('/dashboard')`
- Rekomendacja: middleware dla centralizacji (nie duplikować w każdej stronie)

### 2. Schemat DB — tabele i RLS write

**`books`** (migration:55-62):
- `id`, `title NOT NULL`, `cover_url text` (nullable), `description text` (nullable), `created_at`, `updated_at`
- INSERT/UPDATE/DELETE: `is_admin()` — linie 310, 313, 316

**`chapters`** (migration:77-84):
- `id`, `book_id → books`, `title NOT NULL`, `ord NOT NULL`, `created_at`
- `UNIQUE(book_id, ord)` — admin musi zarządzać ord (numeracja sekwencyjna)
- INSERT/UPDATE/DELETE: `is_admin()` — linie 340, 343, 346

**`lessons`** (migration:89-97):
- `id`, `chapter_id → chapters`, `title NOT NULL`, `content NOT NULL` (Markdown/HTML), `ord NOT NULL`, `created_at`
- `UNIQUE(chapter_id, ord)`
- INSERT/UPDATE/DELETE: `is_admin()` — linie 355, 358, 361

**`exercises`** (migration:102-111):
- `id`, `lesson_id → lessons`, `type public.exercise_type NOT NULL` (ENUM), `prompt NOT NULL`, `payload jsonb default '{}'`, `ord NOT NULL`, `created_at`
- `UNIQUE(lesson_id, ord)`
- INSERT/UPDATE/DELETE: `is_admin()` — linie 370, 373, 376

**`exercise_keys`** (migration:116-123):
- `id`, `exercise_id → exercises`, `key_text NOT NULL`, `key_metadata jsonb` (nullable — `is_reference_only` flag), `ord NOT NULL`
- `UNIQUE(exercise_id, ord)` — wielokrotne warianty odpowiedzi per ćwiczenie
- **BRAK `created_at`** — jedyna tabela bez tego kolumny
- INSERT/UPDATE/DELETE: `is_admin()` — linie 385, 388, 391

**`exercise_type` enum** (migration:32-39):
```sql
create type public.exercise_type as enum (
  'multiple_choice', 'fill_in_blank', 'matching',
  'true_false', 'sentence_transformation', 'open_ended'
);
```

**`payload` jsonb per typ:**
- `multiple_choice`: `{ options: string[] }` (znany z S-01 seed)
- pozostałe typy: shape nieokreślony przez schema — definiowany aplikacyjnie (Zod per typ)

### 3. Istniejące UI komponenty

**Do reuse bez zmian:**
- `src/components/ui/button.tsx` — `Button` + `buttonVariants`, wszystkie warianty
- `src/components/auth/SubmitButton.tsx` — wraps Button + `useFormStatus()` spinner
- `src/components/auth/ServerError.tsx` — error banner, drop-in

**Do adaptacji:**
- `src/components/auth/FormField.tsx` — kontrolowany input z label/error/hint, ale hardcoded dark/purple auth theme. Stworzyć `AdminFormField` z tokenami `bg-background border-border text-foreground focus:ring-ring`.

**Muszą być dodane:**
- `shadcn add input textarea select checkbox label` — żaden nie istnieje w `src/components/ui/`
- Admin layout (`src/layouts/AdminLayout.astro`) — `Layout.astro` to bare HTML shell bez nav/sidebar

**Tailwind v4** (config-in-CSS):
- Wszystkie tokeny w `src/styles/global.css` (`--background`, `--foreground`, `--border`, `--input`, `--ring`)
- Admin UI powinno używać tych tokenów (nie hardcoded dark klas z auth)

### 4. Rich Text Editor

**Aktualnie zainstalowane:** `marked@^18.0.5` — wyłącznie server-side render (Markdown → HTML).

**Żaden kliencki edytor nie jest zainstalowany.** Opcje:

| Opcja | Za | Przeciw |
|---|---|---|
| `<textarea>` + `marked` preview | Zero nowych deps, Workers-safe | Brak WYSIWYG, trudne do formatowania |
| `@tiptap/react` (rekomendacja) | React 19 kompatybilny, browser-only runtime, aktywnie utrzymywany, rozszerzalny | +~100KB gzip, instalacja `@tiptap/react @tiptap/starter-kit` |
| `Lexical (@lexical/react)` | Meta-maintained, React 19, browser-only | Trudniejszy API, mniej gotowych rozszerzeń |

**Ograniczenie Cloudflare Workers**: edytor musi działać wyłącznie w przeglądarce (`client:load` island). Żadna cześć edytora nie może importować Node.js builtins. Zarówno Tiptap jak i Lexical spełniają ten warunek — są pure browser.

**Decyzja dla planu**: tech lead decyduje w `/10x-plan`. Domyślna rekomendacja: **Tiptap** (prostszy API, bogatsza dokumentacja, React 19 ready).

**Format przechowywania:** `lessons.content text` — może przechowywać HTML (Tiptap output) lub Markdown. Server-side `marked` już renderuje Markdown do HTML. Jeśli Tiptap → content = HTML; jeśli textarea → content = Markdown. Decyzja rzutuje na student render path (obecnie `marked.parse(lesson.content)`).

### 5. Supabase Storage (okładki książek)

**Aktualny stan:** `books.cover_url text` (nullable) istnieje. Brak Storage bucket w migracji. Supabase JS (`@supabase/supabase-js`) zawiera klienta Storage wewnętrznie.

**Opcje:**
- A) **URL zewnętrzny** — admin wkleja URL okładki. Zero infrastruktury Storage. Szybko.
- B) **Supabase Storage** — bucket `book-covers`, upload pliku, store URL. Wymaga bucket w migracji + polityki Storage RLS.

**MVP default:** opcja A (public URL) — wystarczy pole `<input type="url">` dla `cover_url`. Bucket można dodać później.

### 6. Supabase Client dla admin writes

**Aktualny** `src/lib/supabase.ts:createClient` zwraca anon-key klienta przez `@supabase/ssr`. Admin INSERT/UPDATE/DELETE przejdą przez RLS (`is_admin()`) — nie wymaga service role key, anon key wystarczy jeśli `auth.uid()` ma role='admin'.

**Uwaga:** API routes dla admin CRUD powinny sprawdzić `role === 'admin'` na poziomie Astro przed operacją DB (defense in depth poza RLS).

### 7. `ord` management

Każda encja z `ord`: `chapters(book_id, ord)`, `lessons(chapter_id, ord)`, `exercises(lesson_id, ord)`, `exercise_keys(exercise_id, ord)` — unique constraint. Admin musi zarządzać kolejnością.

**Opcje:**
- A) Auto: przy INSERT oblicz `MAX(ord) + 1` dla danego parent. Usuwanie/reordering pozostawia luki (akceptowalne dla MVP).
- B) Manual: admin podaje liczby. Prostsze w implementacji, nieporęczne w UX.

**Rekomendacja MVP:** opcja A (auto-increment w API route).

## Odniesienia do kodu

- `src/middleware.ts:4` — PROTECTED_ROUTES (do rozszerzenia o `/admin`)
- `src/middleware.ts:16-27` — role setting z user_roles
- `src/env.d.ts:1-6` — Locals interface (role already typed)
- `supabase/migrations/20260625184555_init.sql:32-39` — exercise_type enum
- `supabase/migrations/20260625184555_init.sql:55-62` — books table
- `supabase/migrations/20260625184555_init.sql:77-84` — chapters table
- `supabase/migrations/20260625184555_init.sql:89-97` — lessons table
- `supabase/migrations/20260625184555_init.sql:102-111` — exercises table
- `supabase/migrations/20260625184555_init.sql:116-123` — exercise_keys table
- `supabase/migrations/20260625184555_init.sql:143-156` — is_admin() function
- `supabase/migrations/20260625184555_init.sql:310-391` — all admin write RLS policies
- `src/components/auth/FormField.tsx` — reusable form field pattern (needs theme adaptation)
- `src/components/auth/SubmitButton.tsx` — reusable submit with pending state
- `src/components/auth/ServerError.tsx` — reusable error banner
- `src/components/auth/SignInForm.tsx` — reference form pattern (validate → POST → error display)
- `src/components/ui/button.tsx` — Button component
- `src/layouts/Layout.astro` — bare shell (AdminLayout needed)

## Wnioski architektoniczne

1. **Admin guard**: rozszerzyć middleware (jeden blok) zamiast per-page — unika duplikacji w każdej admin stronie

2. **Admin layout**: stworzyć `src/layouts/AdminLayout.astro` z sidebar (linki: Książki, Rozdziały, Lekcje, Ćwiczenia) — nie modyfikować `Layout.astro`

3. **Formularz CRUD pattern**: POST do `/api/admin/[entity]` API route (Astro endpoint) → Zod validate → Supabase INSERT/UPDATE → redirect lub error. React island tylko dla rich text editora; wszystkie inne formy mogą być native HTML forms w `.astro` (prostsze, zero JS).

4. **`ord` auto-increment**: w każdym API route INSERT: `SELECT COALESCE(MAX(ord), -1) + 1 FROM table WHERE parent_id = $id` — brak race condition w single-admin MVP

5. **Content format**: kluczowa decyzja dla planu — HTML (Tiptap) vs Markdown (textarea). Jeśli HTML: student render path (`marked.parse`) wymaga zamiany na `set:html` bez parsowania. Jeśli Markdown: textarea wystarczy, marked działa dalej.

6. **Cover URL**: MVP = wklejony URL (opcja A). Brak Supabase Storage na start.

7. **shadcn form primitives**: dodać przez `npx shadcn add input textarea select checkbox label` — żaden nie istnieje; dodanie nie łamie istniejącego kodu

## Kontekst historyczny

- `context/changes/bet-data-foundation/plan.md` — decyzja o `exercise.payload` jako JSON discriminated union; `exercise_type` enum jako rozszerzalny punkt dla S-06/S-07
- `context/changes/first-lesson-end-to-end/plan.md` — `marked.parse()` jako server-side renderer; `is_reference_only` w `key_metadata` dla open-ended

## Powiązane badania

- `context/changes/sequential-navigation-and-chapter-completion/research.md` — analiza chapters/lessons schema, RLS, chapter_progress view

## Otwarte pytania

1. **Rich text format**: HTML (Tiptap → `set:html`) vs Markdown (textarea → `marked.parse`)? Zmiana formatu wymaga migracji danych lub dwóch ścieżek renderowania.
2. **Admin guard lokalizacja**: middleware (centralny) vs per-page (elastyczny)? Middleware prostsze, ale mniej granularne.
3. **`ord` reordering UI**: drag-and-drop (scope creep) vs numeryczne pola (MVP-safe)?
4. **Cover upload**: URL (MVP) vs Supabase Storage bucket (wymagana migracja + polityki)?
5. **Exercise payload schema dla S-02**: czy admin UI obsługuje wszystkie 6 typów, czy tylko `multiple_choice` + `fill_in_blank` (S-06 scope)?
