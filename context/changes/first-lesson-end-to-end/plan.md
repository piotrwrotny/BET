# Plan wdrożenia S-01: Student kończy pierwszą lekcję od początku do końca

## Przegląd

Budujemy minimalną pełną pętlę nauki (gwiazda przewodnia): zalogowany student widzi swoją książkę na dashboardzie, klika „Kontynuuj naukę", trafia na stronę lekcji, czyta treść (Markdown → HTML server-side), wykonuje ćwiczenie multiple-choice (React island + server-side verify API), klika „Przeczytano" i widzi badge „Ukończona". Wynik zapisuje się nieodwracalnie w `lesson_progress`.

Ten slice ustanawia trzy wzorce reprodukowane w każdym następnym fragmencie:
1. **Rola w middleware** — `Astro.locals.role` dostępne we wszystkich chronionych trasach.
2. **Kontrakt weryfikacji ćwiczenia** — klucze odpowiedzi nigdy nie trafiają do przeglądarki; server-side API porównuje z `exercise_keys`.
3. **Warunek zapisu `lesson_progress`** (FR-015) — przycisk + wszystkie closed exercises poprawne.

## Analiza stanu obecnego

- **Dashboard**: stub — wyświetla jedynie `user.email` i przycisk sign out.
- **Middleware**: ustawia `Astro.locals.user`, brak `role`. `env.d.ts` definiuje tylko `user: User | null`.
- **Trasy domenowe**: nie istnieją. Brak `/lessons/[id]`, brak `/api/exercises/*`, brak `/api/lessons/*`.
- **Komponenty React**: tylko auth (SignInForm, SignUpForm). Brak komponentów domeny nauki.
- **Zależności**: brak `zod` i `marked` w `package.json`.
- **Supabase client**: `src/lib/supabase.ts` — fabryka `createClient(headers, cookies)` gotowa do reuse w API routes.
- **Schema**: F-01 dostarcza 8 tabel + RLS + seed (1 book, 2 chapters, 5 lessons, 5 exercises w tym 1 MC).

## Pożądany stan końcowy

Student `student@bet.local` może:
1. Zalogować się i zobaczyć „FCE Practice Book 1" na dashboardzie z przyciskiem „Kontynuuj naukę".
2. Kliknąć przycisk i trafić na `/lessons/[id]` pierwszej nieukończonej lekcji.
3. Przeczytać treść lekcji renderowaną jako HTML (nie surowy Markdown).
4. Wybrać opcję w ćwiczeniu multiple-choice i kliknąć „Sprawdź" — dostać natychmiastowy feedback (poprawna/niepoprawna).
5. Po poprawnej odpowiedzi kliknąć „Przeczytano" — zobaczyć badge „Ukończona ✓" i zablokowany przycisk.
6. Po odświeżeniu strony lekcja nadal pokazuje się jako ukończona (state z DB, nie z pamięci przeglądarki).

### Kluczowe odkrycia

- `lesson_progress` ma PK `(user_id, lesson_id)` — INSERT przy duplikacie rzuci błąd; użyj `.upsert(..., { onConflict: 'user_id,lesson_id', ignoreDuplicates: true })` dla idempotentności.
- RLS na `lesson_progress` INSERT: `user_id = auth.uid() AND has_lesson_access(lesson_id)` — supabase klient z anon key + sesja studenta automatycznie egzekwuje tę politykę.
- `exercise_keys` z `key_metadata->>'is_reference_only' = 'true'` to wzorcowe odpowiedzi dla open-ended — pomiń przy weryfikacji.
- `lessons.content` zawiera Markdown (potwierdzone przez seed.sql). Renderer: `marked.parse()` server-side → `<Fragment set:html={html} />` w Astro.
- `exercises` dla S-01: tylko `multiple_choice` wymaga weryfikacji. Lesson 1 (Past Simple vs Present Perfect) ma 1 ćwiczenie MC z 1 kluczem `'went'`.

## Czego NIE robimy

- Nawigacja next/prev między lekcjami (S-05).
- Procent postępu / profil studenta (S-04).
- Typy ćwiczeń poza `multiple_choice` — fill-in-blank, true/false, sentence transformation renderujemy statycznie lub jako disabled placeholder (S-06/S-07 je obsłuży).
- Admin UI do tworzenia treści (S-02).
- Obsługa `open_ended` exercises poza wyświetleniem prompta + wzorcowej odpowiedzi (FR-025: nie blokuje ukończenia).
- Dashboard z procentem ukończenia (S-04).
- Optymalizacja N+1 zapytań na dashboardzie — MVP z 1 książką, skalowanie w S-04/S-05.

## Podejście do implementacji

Cztery fazy o rosnącej złożoności, każda weryfikowalna niezależnie:

1. **Infrastructure** — deps + typing + middleware role. Nie dotyka UI.
2. **Dashboard rework** — czysta strona SSR, bez React.
3. **Lesson page SSR** — nowa trasa, dane z DB, Markdown → HTML. Bez interaktywności.
4. **Exercise & Completion** — React island + dwa API endpoints. Pełna pętla end-to-end.

Fazy 1–3 można wdrożyć i zweryfikować bez żadnego JS po stronie klienta. Faza 4 dodaje interaktywność jako wyspę Astro (`client:load`).

## Krytyczne szczegóły implementacji

**Idempotentność lesson_progress**: `lesson_progress` ma PK `(user_id, lesson_id)`. Nie używaj `.insert()` — przy drugim wywołaniu rzuci `23505 unique violation`. Zawsze używaj `.upsert(..., { onConflict: 'user_id,lesson_id', ignoreDuplicates: true })`.

**RLS + anon key w API endpoints**: `createClient(request.headers, context.cookies)` tworzy klienta z sesją użytkownika. RLS egzekwuje prawa dostępu automatycznie — nie implementuj własnej warstwy autoryzacji poza `getUser()` → 401.

**Closed exercises vs open-ended dla FR-015**: `closedExerciseCount` to count ćwiczeń lekcji z typem != `'open_ended'`. `LessonInteractive` blokuje „Przeczytano" dopóki `completedExercises.size < closedExerciseCount`.

---

## Faza 1: Infrastructure — deps, Locals typing, middleware role

### Przegląd

Instalacja `zod` i `marked`, rozszerzenie `Astro.locals` o `role`, aktualizacja middleware do query `user_roles`. Żadne strony ani trasy nie są dotknięte — tylko warstwa infrastruktury.

### Wymagane zmiany

#### 1. Zależności

**Plik**: `package.json`

**Cel**: Dodaj `marked` (Markdown → HTML server-side) i `zod` (walidacja body API). Obie paczki są potrzebne od fazy 3/4 i wchodzą razem, żeby nie rozdzielać instalacji.

**Kontrakt**: `"marked": "^15.0.0"` i `"zod": "^3.24.0"` w `dependencies`.

#### 2. Locals typing

**Plik**: `src/env.d.ts`

**Cel**: Dodaj `role: 'admin' | 'student' | null` do interfejsu `App.Locals`, żeby TypeScript enforceował typ roli we wszystkich plikach korzystających z `Astro.locals.role`.

**Kontrakt**:
```ts
declare namespace App {
  interface Locals {
    user: import('@supabase/supabase-js').User | null
    role: 'admin' | 'student' | null
  }
}
```

#### 3. Middleware — role query

**Plik**: `src/middleware.ts`

**Cel**: Po ustawieniu `locals.user`, gdy `user != null`, odpytaj `user_roles` i ustaw `locals.role`. Gdy `user == null` → `locals.role = null`. Pojedyncze query per request tylko dla zalogowanych użytkowników.

**Kontrakt**: Po bloku `context.locals.user = user ?? null` dodaj:
```ts
if (user) {
  const { data: roleRow } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single()
  context.locals.role = roleRow?.role ?? null
} else {
  context.locals.role = null
}
```
`PROTECTED_ROUTES` guard nie zmienia się — middleware zachowuje obecną logikę przekierowania do `/auth/signin`.

### Kryteria sukcesu

#### Weryfikacja automatyczna

- `npm install` — instaluje `zod` i `marked` bez błędów.
- `npx tsc --noEmit` — przechodzi z nowym polem `role` w `Locals`.
- `npm run build` — przechodzi.

#### Weryfikacja ręczna

- Zaloguj się jako `student@bet.local`. Dodaj tymczasowy `console.log(Astro.locals.role)` w `dashboard.astro` i sprawdź w terminalu dev-serwera — powinno wypisać `'student'`.

---

## Faza 2: Dashboard rework — lista książek i „Kontynuuj naukę"

### Przegląd

Zastąp stub dashboardu prawdziwą listą książek studenta z przyciskami „Kontynuuj naukę" linkującymi do pierwszej nieukończonej lekcji w każdej książce. Czysta strona Astro SSR — bez React.

### Wymagane zmiany

#### 1. Dashboard page

**Plik**: `src/pages/dashboard.astro`

**Cel**: Wyświetl listę książek do których student ma dostęp. Dla każdej książki pokaż tytuł i przycisk „Kontynuuj naukę" linkujący do `/lessons/[firstUnfinishedLessonId]`. Jeśli wszystkie lekcje w książce ukończone — komunikat „Gratulacje, książka ukończona". Jeśli brak książek — komunikat „Nie masz jeszcze przypisanych książek".

**Kontrakt**: Trzy zapytania Supabase w frontmatter:
1. `user_book_access` join `books` → lista książek studenta (RLS: widzi tylko własne).
2. Dla każdej książki: `lessons` join `chapters` gdzie `chapters.book_id = bookId`, ordered by `chapters.ord ASC`, `lessons.ord ASC` → pełna lista lekcji w kolejności.
3. `lesson_progress` → lista ukończonych lesson_id dla zalogowanego studenta (RLS: widzi tylko własne).

Logika w frontmatter: dla każdej książki znajdź pierwszą lekcję (z kroku 2) której ID nie ma w zbiorze ukończonych (krok 3). To `firstUnfinishedLessonId`.

N+1 przy wielu książkach jest akceptowalne na MVP (seed ma 1 książkę). Komentarz w kodzie: `// TODO S-04: replace with single aggregating query`.

Zachowaj przycisk sign out z obecnej wersji.

### Kryteria sukcesu

#### Weryfikacja automatyczna

- `npx tsc --noEmit` — przechodzi.
- `npm run build` — przechodzi.

#### Weryfikacja ręczna

- Zaloguj jako `student@bet.local` → dashboard pokazuje „FCE Practice Book 1" z przyciskiem „Kontynuuj naukę".
- Kliknij „Kontynuuj naukę" → URL zmienia się na `/lessons/00000000-0000-0000-0000-000000000030` (pierwsza lekcja z seed).
- Zaloguj jako `admin@bet.local` → dashboard nie pokazuje żadnej książki (admin nie ma wpisów w `user_book_access`) i wyświetla stan pusty.

---

## Faza 3: Lesson page SSR — trasa, treść, dane dla wyspy

### Przegląd

Nowa strona `/lessons/[id].astro` — pobiera lekcję przez RLS, parsuje Markdown do HTML, sprawdza status ukończenia, przekazuje dane jako props do `LessonInteractive` (który zbudujesz w Fazie 4). Faza 3 kończy się działającą stroną z wyrenderowaną treścią i placeholderem na wyspę.

### Wymagane zmiany

#### 1. Lesson page

**Plik**: `src/pages/lessons/[id].astro`

**Cel**: SSR strona lekcji. Pobiera lekcję i jej ćwiczenia przez Supabase (RLS automatycznie filtruje dostęp). Parsuje `lesson.content` (Markdown) do HTML za pomocą `marked.parse()`. Sprawdza czy lekcja jest już ukończona (`lesson_progress`). Renderuje treść i przekazuje dane do `LessonInteractive`.

**Kontrakt — request flow**:
1. `const id = Astro.params.id` — UUID lekcji z URL.
2. Utwórz klienta Supabase: `createClient(Astro.request.headers, Astro.cookies)`.
3. `getUser()` → jeśli brak sesji → redirect `/auth/signin`.
4. Query `lessons` z `exercises` w nested select, `.eq('id', id).single()`. Jeśli `data === null` (RLS blokuje lub zły ID) → redirect 302 `/dashboard`.
5. `marked.parse(lesson.content)` → `contentHtml: string`.
6. Query `lesson_progress` `.eq('lesson_id', id).maybeSingle()` → `isCompleted: boolean`.
7. Odfiltruj `open_ended` exercises przy liczeniu `closedExerciseCount`.
8. Render: tytu nagłówek (`<h1>`), `<Fragment set:html={contentHtml} />`, `<LessonInteractive client:load ... />`.

**Kontrakt — Supabase query**:
```ts
const { data: lesson } = await supabase
  .from('lessons')
  .select(`
    id, title, content, ord,
    chapters ( id, title, book_id ),
    exercises ( id, type, prompt, payload, ord )
  `)
  .eq('id', id)
  .single()
```
Posortuj `lesson.exercises` po `ord` ASC w frontmatter przed przekazaniem do wyspy.

**Kontrakt — props do wyspy** (forward-compatible z Fazą 4):
```ts
interface LessonInteractiveProps {
  lessonId: string
  exercises: Array<{
    id: string
    type: string
    prompt: string
    payload: Record<string, unknown>
    ord: number
  }>
  isAlreadyCompleted: boolean
  closedExerciseCount: number
}
```

Na końcu Fazy 3 `LessonInteractive` może być stubem `<div>Exercises here</div>` — strona musi być funkcjonalna bez wyspy.

#### 2. PROTECTED_ROUTES extension

**Plik**: `src/middleware.ts`

**Cel**: Dodaj `/lessons` do `PROTECTED_ROUTES`, żeby middleware przekierowywał niezalogowanych użytkowników do `/auth/signin` przed dotarciem do strony lekcji.

**Kontrakt**: `const PROTECTED_ROUTES = ['/dashboard', '/lessons']`.

### Kryteria sukcesu

#### Weryfikacja automatyczna

- `npx tsc --noEmit` — przechodzi.
- `npm run build` — przechodzi.
- GET `/lessons/00000000-0000-0000-0000-000000000099` (nieistniejący UUID) jako zalogowany student → redirect 302 do `/dashboard`.

#### Weryfikacja ręczna

- Jako `student@bet.local`: `/lessons/00000000-0000-0000-0000-000000000030` → strona lekcji z tytułem „Past Simple vs Present Perfect" i treścią wyrenderowaną jako HTML (nagłówki, pogrubienie — nie surowy Markdown z `##` i `**`).
- Jako niezalogowany użytkownik: `/lessons/00000000-0000-0000-0000-000000000030` → redirect do `/auth/signin`.
- Jako `student@bet.local`: `/lessons/00000000-0000-0000-0000-000000000031` (inna lekcja, dostępna) → wyświetla się poprawnie (RLS dopuszcza).

---

## Faza 4: Exercise & Completion — React island, verify API, complete API

### Przegląd

Pełna interaktywna pętla: `MultipleChoiceExercise` (wybór + feedback), `LessonInteractive` (orkiestracja stanu + „Przeczytano"), dwa API endpoints. Po tej fazie S-01 jest end-to-end weryfikowalny.

### Wymagane zmiany

#### 1. MultipleChoiceExercise component

**Plik**: `src/components/lesson/MultipleChoiceExercise.tsx`

**Cel**: Interaktywny komponent MC. Renderuje prompt + opcje jako radio buttons. „Sprawdź" → POST do `/api/exercises/verify` → feedback inline. Po poprawnej odpowiedzi: wywołaj `onCorrect(exerciseId)` i zablokuj komponent (nie można zmieniać odpowiedzi). Po niepoprawnej: feedback „Niepoprawnie — spróbuj ponownie", odblokuj kolejną próbę.

**Kontrakt**:
```ts
interface MultipleChoiceExerciseProps {
  exercise: {
    id: string
    prompt: string
    payload: { options: string[] }
  }
  onCorrect: (exerciseId: string) => void
  disabled?: boolean  // gdy lekcja już ukończona
}
```
State: `selectedOption: string | null`, `feedback: null | 'correct' | 'incorrect'`, `locked: boolean` (true po poprawnej odpowiedzi), `loading: boolean`.

Submit body: `{ exercise_id: exercise.id, answer: selectedOption }`.

#### 2. LessonInteractive island

**Plik**: `src/components/lesson/LessonInteractive.tsx`

**Cel**: Główna wyspa React zarządzająca stanem ukończenia lekcji. Renderuje listę ćwiczeń (MC przez `MultipleChoiceExercise`; inne typy jako statyczny `<p>` z promptem i komunikatem „Dostępne wkrótce" — S-06/S-07). Zarządza przyciskiem „Przeczytano" z logiką FR-015.

**Kontrakt**:
```ts
interface LessonInteractiveProps {
  lessonId: string
  exercises: Array<{ id: string; type: string; prompt: string; payload: Record<string, unknown>; ord: number }>
  isAlreadyCompleted: boolean
  closedExerciseCount: number
}
```

State: `completedExercises: Set<string>`, `isCompleted: boolean` (init: `isAlreadyCompleted`), `completing: boolean`, `errorMessage: string | null`.

„Przeczytano" click logic:
- `if (completedExercises.size < closedExerciseCount)` → `setErrorMessage('Ukończ najpierw wszystkie ćwiczenia zamknięte.')` → return.
- `setErrorMessage(null)`, `setCompleting(true)`.
- POST `/api/lessons/${lessonId}/complete`.
- Response ok → `setIsCompleted(true)`.
- `setCompleting(false)`.

Gdy `isCompleted`:
- Przycisk zamieniony na badge „Ukończona ✓" (disabled, styl success).
- `disabled={true}` propagowane do wszystkich ćwiczeń.
- Brak wyświetlania `errorMessage`.

#### 3. Verify API endpoint

**Plik**: `src/pages/api/exercises/verify.ts`

**Cel**: Server-side weryfikacja odpowiedzi. Klucze odpowiedzi nigdy nie trafiają do klienta.

**Kontrakt — request**:
```ts
// POST body (JSON), Zod schema:
const VerifyBodySchema = z.object({
  exercise_id: z.string().uuid(),
  answer: z.string().min(1),
})
```

**Kontrakt — flow**:
1. Parse JSON body → Zod → 400 jeśli invalid.
2. `createClient(request.headers, cookies)`.
3. `getUser()` → 401 jeśli brak sesji.
4. Query `exercise_keys` where `exercise_id = body.exercise_id` (RLS auto-filtruje).
5. Jeśli 0 kluczy → `{ correct: false }` (nie 404 — nie ujawniaj czy ID istnieje).
6. Porównanie: `body.answer.trim().toLowerCase()` vs każdy `key.key_text.trim().toLowerCase()`, pomijając klucze z `key_metadata->>'is_reference_only' === 'true'`.
7. Return `{ correct: boolean }`.

#### 4. Complete API endpoint

**Plik**: `src/pages/api/lessons/[id]/complete.ts`

**Cel**: Idempotentny INSERT do `lesson_progress`. Zwraca sukces nawet jeśli lekcja już była ukończona.

**Kontrakt — flow**:
1. `createClient(request.headers, context.cookies)`.
2. `getUser()` → 401 jeśli brak sesji.
3. `context.params.id` = lesson UUID.
4. `.upsert({ user_id: user.id, lesson_id: id }, { onConflict: 'user_id,lesson_id', ignoreDuplicates: true })`.
5. Jeśli Supabase error (np. RLS — `has_lesson_access` zwróciło false) → 403.
6. Return `{ success: true }`.

### Kryteria sukcesu

#### Weryfikacja automatyczna

- `npx tsc --noEmit` — przechodzi.
- `npm run build` — przechodzi.
- POST `/api/exercises/verify` bez auth header/cookie → 401.
- POST `/api/exercises/verify` z `{ exercise_id: "00000000-0000-0000-0000-000000000040", answer: "went" }` jako `student@bet.local` → `{ correct: true }`.
- POST `/api/exercises/verify` z `{ exercise_id: "00000000-0000-0000-0000-000000000040", answer: "have gone" }` → `{ correct: false }`.
- POST `/api/lessons/00000000-0000-0000-0000-000000000030/complete` jako `student@bet.local` → `{ success: true }`.
- Powtórny POST do tego samego endpointu → `{ success: true }` (idempotentny, brak błędu 409).

#### Weryfikacja ręczna

- Otwórz `/lessons/00000000-0000-0000-0000-000000000030` jako `student@bet.local`.
- Kliknij „Przeczytano" bez zaznaczenia ćwiczenia → pojawia się komunikat błędu „Ukończ najpierw wszystkie ćwiczenia zamknięte."
- Wybierz „have gone" (błędna odpowiedź) → kliknij „Sprawdź" → feedback „Niepoprawnie — spróbuj ponownie".
- Wybierz „went" (poprawna) → kliknij „Sprawdź" → feedback „Poprawnie ✓", ćwiczenie zablokowane.
- Kliknij „Przeczytano" → badge „Ukończona ✓" pojawia się, przycisk znika/jest disabled.
- Odśwież stronę → lekcja wyświetla się jako już ukończona (badge z SSR, przycisk disabled).
- Sprawdź w Supabase Studio (SQL Editor): `SELECT * FROM public.lesson_progress WHERE user_id = '00000000-0000-0000-0000-000000000002'` → wiersz dla lesson `...0030`.
- Z dashboardu: „Kontynuuj naukę" po ukończeniu lekcji 1 linkuje do lekcji 2 (`...0031`).

---

## Strategia testowania

### Weryfikacja automatyczna (curl / fetch w terminalu)

```bash
# Verify correct answer (wymaga ważnego session cookie)
curl -X POST http://127.0.0.1:4321/api/exercises/verify \
  -H "Content-Type: application/json" \
  -H "Cookie: <session-cookie>" \
  -d '{"exercise_id":"00000000-0000-0000-0000-000000000040","answer":"went"}'
# Expected: {"correct":true}

# Verify wrong answer
curl -X POST http://127.0.0.1:4321/api/exercises/verify \
  -H "Content-Type: application/json" \
  -H "Cookie: <session-cookie>" \
  -d '{"exercise_id":"00000000-0000-0000-0000-000000000040","answer":"gone"}'
# Expected: {"correct":false}

# Complete lesson
curl -X POST http://127.0.0.1:4321/api/lessons/00000000-0000-0000-0000-000000000030/complete \
  -H "Cookie: <session-cookie>"
# Expected: {"success":true}
```

### Kroki testowania ręcznego (pełna pętla E2E)

1. `npm run db:reset` — czyste środowisko.
2. `npm run dev` — dev serwer na `http://127.0.0.1:4321`.
3. Przejdź na `/auth/signin`, zaloguj jako `student@bet.local` / `student-pass`.
4. Dashboard → widoczna książka „FCE Practice Book 1".
5. Kliknij „Kontynuuj naukę" → przejdź na `/lessons/…0030`.
6. Sprawdź: tytuł „Past Simple vs Present Perfect", treść w HTML (nie surowy Markdown).
7. Kliknij „Przeczytano" bez ćwiczenia → alert o błędzie.
8. Wybierz błędną odpowiedź → „Sprawdź" → feedback błędny.
9. Wybierz „went" → „Sprawdź" → feedback poprawny.
10. Kliknij „Przeczytano" → badge „Ukończona ✓".
11. Odśwież — stan zachowany.
12. Wróć na dashboard → „Kontynuuj naukę" wskazuje lekcję 2.

## Referencje

- Roadmap S-01: `context/foundation/roadmap.md` (linia 81–93)
- PRD FR-014, FR-015, FR-022, FR-024, FR-025: `context/foundation/prd.md`
- Schema + RLS: `supabase/migrations/20260625184555_init.sql`
- Seed data (UUIDs): `supabase/seed.sql`
- DB types: `src/lib/database.types.ts`
- Supabase client factory: `src/lib/supabase.ts`
- Existing middleware pattern: `src/middleware.ts`

---

## Postęp

> Konwencja: `- [ ]` oczekujące, `- [x]` wykonane. Dodaj ` — <commit sha>`, gdy krok zostanie zrealizowany. Nie zmieniaj nazw tytułów kroków. Zobacz `references/progress-format.md`.

### Faza 1: Infrastructure — deps, Locals typing, middleware role

#### Automatyczne

- [x] 1.1 `npm install` instaluje `zod` i `marked` bez błędów — 4539ac0
- [x] 1.2 `npx tsc --noEmit` przechodzi z nowym polem `role` w `Locals` — 4539ac0
- [x] 1.3 `npm run build` przechodzi — 4539ac0

#### Ręczne

- [x] 1.4 Zalogowany jako `student@bet.local` → `Astro.locals.role === 'student'` potwierdzone w dev (console.log lub debugger) — 4539ac0

### Faza 2: Dashboard rework — lista książek i „Kontynuuj naukę"

#### Automatyczne

- [x] 2.1 `npx tsc --noEmit` przechodzi — 01a6f6e
- [x] 2.2 `npm run build` przechodzi — 01a6f6e

#### Ręczne

- [x] 2.3 Zalogowany jako `student@bet.local` → dashboard pokazuje „FCE Practice Book 1" z przyciskiem „Kontynuuj naukę" — 01a6f6e
- [x] 2.4 Przycisk „Kontynuuj naukę" linkuje do `/lessons/00000000-0000-0000-0000-000000000030` — 01a6f6e
- [x] 2.5 Zalogowany jako `admin@bet.local` → dashboard pokazuje stan pusty (brak książek w `user_book_access`) — 01a6f6e

### Faza 3: Lesson page SSR — trasa, treść, dane dla wyspy

#### Automatyczne

- [x] 3.1 `npx tsc --noEmit` przechodzi — 8f04659
- [x] 3.2 `npm run build` przechodzi — 8f04659
- [x] 3.3 GET `/lessons/00000000-0000-0000-0000-000000000099` (nieistniejący UUID) jako zalogowany student → redirect 302 do `/dashboard` — 8f04659

#### Ręczne

- [x] 3.4 `/lessons/00000000-0000-0000-0000-000000000030` jako `student@bet.local` → tytuł „Past Simple vs Present Perfect", treść wyrenderowana jako HTML (nagłówki, pogrubienie — nie surowy Markdown) — 8f04659
- [x] 3.5 `/lessons/00000000-0000-0000-0000-000000000030` jako niezalogowany użytkownik → redirect do `/auth/signin` — 8f04659

### Faza 4: Exercise & Completion — React island, verify API, complete API

#### Automatyczne

- [x] 4.1 `npx tsc --noEmit` przechodzi
- [x] 4.2 `npm run build` przechodzi
- [x] 4.3 POST `/api/exercises/verify` bez sesji → 401
- [x] 4.4 POST `/api/exercises/verify` z `answer: "went"` dla MC exercise → `{ correct: true }`
- [x] 4.5 POST `/api/exercises/verify` z `answer: "have gone"` → `{ correct: false }`
- [x] 4.6 POST `/api/lessons/00000000-0000-0000-0000-000000000030/complete` jako `student@bet.local` → `{ success: true }`
- [x] 4.7 Powtórny POST do complete → `{ success: true }` (idempotentny)

#### Ręczne

- [x] 4.8 Na stronie lekcji: „Przeczytano" bez zaliczonego ćwiczenia → komunikat o błędzie
- [x] 4.9 Wybierz błędną odpowiedź MC → „Sprawdź" → feedback „Niepoprawnie — spróbuj ponownie"
- [x] 4.10 Wybierz „went" → „Sprawdź" → feedback „Poprawnie ✓", ćwiczenie zablokowane
- [x] 4.11 Kliknij „Przeczytano" po poprawnym ćwiczeniu → badge „Ukończona ✓", przycisk disabled
- [x] 4.12 Odśwież stronę lekcji → lekcja nadal pokazuje się jako ukończona (z DB)
- [x] 4.13 Studio SQL: `SELECT * FROM lesson_progress WHERE user_id = '00000000-0000-0000-0000-000000000002'` → wiersz dla lekcji `…0030`
- [x] 4.14 Dashboard po ukończeniu lekcji 1 → „Kontynuuj naukę" wskazuje lekcję 2 (`…0031`)
