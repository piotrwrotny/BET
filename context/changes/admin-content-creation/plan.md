# Plan wdrożenia: Admin Content Creation (S-02)

## Przegląd

Admin dostaje kompletny panel CRUD do zarządzania treściami kursu: książki → rozdziały → lekcje (Markdown) → ćwiczenia z kluczami odpowiedzi. Dostęp wyłącznie dla roli `admin`, centralnie chroniony w middleware. Pięć tabel DB z write RLS opartymi na `is_admin()` jest już gotowych — implementacja skupia się wyłącznie na UI, React islands i API routes.

## Analiza stanu obecnego

**Gotowe — zero pracy:**
- 5 tabel z write RLS (`is_admin()`): `books`, `chapters`, `lessons`, `exercises`, `exercise_keys` — migration:310–391
- `exercise_type` enum z 6 wartościami — migration:32–39
- `books.cover_url text` nullable — migration:58
- `Button`, `SubmitButton`, `ServerError` gotowe do reuse
- `zod` v4 zainstalowany, `marked` zainstalowany

**Brakuje:**
- `/admin` nie w `PROTECTED_ROUTES`, brak role guard — middleware.ts:4
- Zero stron `/admin/*`, API routes, layoutu adminowego
- Shadcn `Input`, `Textarea`, `Select`, `Label` — żaden nie istnieje w `src/components/ui/`
- `AdminLayout.astro` z sidebarrem

## Pożądany stan końcowy

Admin (`admin@bet.local`) wchodzi na `/admin`, widzi listę książek, tworzy hierarchię treści przez UI bez SQL. Każda nowo stworzona treść jest natychmiastowo widoczna w dashboard studenta (RLS SELECT policies istniejące). Student odwiedzający `/admin` otrzymuje redirect → `/dashboard`.

### Kluczowe odkrycia

- Admin writes działają przez anon-key klienta — `is_admin()` sprawdza `auth.uid()`, brak service role key potrzebny (migration:143–156)
- `exercise.payload jsonb`: MC = `{ options: string[] }`, FIB/T/F = `{}` — format ustalony przez seed + S-01
- `exercise_keys` nie ma kolumny `created_at` — jedyna tabela bez niej (migration:116–123)
- `lessons.content` = Markdown — student render path (`marked.parse`) pozostaje bez zmian
- Cascade deletes: `books → chapters → lessons → exercises → exercise_keys` — wszystkie ON DELETE CASCADE
- Supabase client: `createClient(request.headers, Astro.cookies)` — obie wartości dostępne w API route context (src/lib/supabase.ts:5)
- Middleware: PROTECTED_ROUTES używa `startsWith` (middleware.ts:30); role guard dodać między istniejącym auth check (linia 34) a `return next()` (linia 36)

## Czego NIE robimy

- Drag-and-drop reordering — auto-append only (`MAX(ord)+1` per rodzic)
- Upload pliku okładki do Supabase Storage — cover_url = wklejany URL tekstowy
- Typy `matching`, `sentence_transformation`, `open_ended` — tylko MC + FIB + T/F
- Podgląd lekcji z perspektywy studenta z admin panelu
- Zarządzanie `user_book_access` (dostęp studentów do książek)
- Role management UI
- Paginacja list encji — dla MVP wszystkie rekordy na jednej stronie

## Podejście do implementacji

**URL schema (flat per encja, query params dla kontekstu):**
```
/admin                         → redirect → /admin/books
/admin/books                   → lista książek
/admin/books/new               → formularz tworzenia
/admin/books/[id]/edit         → formularz edycji

/admin/chapters?book_id=X      → lista rozdziałów dla książki
/admin/chapters/new?book_id=X  → formularz tworzenia
/admin/chapters/[id]/edit      → formularz edycji

/admin/lessons?chapter_id=X    → lista lekcji dla rozdziału
/admin/lessons/new?chapter_id=X → formularz tworzenia (MarkdownEditor island)
/admin/lessons/[id]/edit        → formularz edycji

/admin/exercises?lesson_id=X   → lista ćwiczeń dla lekcji
/admin/exercises/new?lesson_id=X → formularz tworzenia (ExerciseForm island)
/admin/exercises/[id]/edit      → formularz edycji
```

**API schema:**
```
POST   /api/admin/books             → insert book
PATCH  /api/admin/books/[id]        → update book
DELETE /api/admin/books/[id]        → delete book (CASCADE → chapters → lessons → exercises → keys)
(identyczna struktura dla chapters, lessons)

POST   /api/admin/exercises         → insert exercise + keys (sequential inserts)
PATCH  /api/admin/exercises/[id]    → update exercise + replace-all keys
DELETE /api/admin/exercises/[id]    → delete exercise (CASCADE → keys)
```

**Wzorzec formularzy:**
- Books / chapters / lessons: native HTML `<form method="post" action="/api/admin/...">` → API route zwraca redirect (302)
- Exercises: React island `ExerciseForm.tsx` (`client:load`) → `fetch` → JSON API → `location.href` redirect
- Delete: inline `onclick` z `confirm()` + `fetch(url, {method:'DELETE'})` → `location.href` redirect
- Błędy formularza: API route redirect z `?error=...` URL param; strona Astro pokazuje `<ServerError>` gdy param present

## Krytyczne szczegóły implementacji

**Ord race condition:** nieistotny w single-admin MVP. Sekwencja: `SELECT COALESCE(MAX(ord), -1) + 1 FROM {table} WHERE {parent_id_col} = $parentId` → używane w INSERT. Jeśli `MAX` zwróci null (brak rekordów), `COALESCE` daje `-1`, +1 = `0`.

**Exercise keys replace-all:** `PATCH /api/admin/exercises/[id]` robi: (1) UPDATE exercise, (2) DELETE FROM exercise_keys WHERE exercise_id = $id, (3) INSERT nowych keys z ord=0,1,2... Partial failure (step 2 ok, step 3 fail) zostawia exercise bez kluczy — akceptowalne ryzyko dla MVP.

**MC correct answer:** payload exercises = `{ options: string[] }` (lista opcji). Klucz (exercise_keys.key_text) musi być jedną z opcji. ExerciseForm.tsx nie waliduje tego krzyżowo — walidacja po stronie API (sprawdź czy key_text in payload.options dla MC).

---

## Faza 1: Infrastruktura (middleware, layout, form primitives)

### Przegląd

Dodaje role guard do middleware, tworzy AdminLayout z sidebarrem, instaluje brakujące shadcn form primitives. Po tej fazie `/admin` jest chroniony i ma poprawny layout — ale brak stron CRUD.

### Wymagane zmiany

#### 1. Middleware — role guard dla /admin

**Plik**: `src/middleware.ts`

**Cel**: Dodać blok role guard po istniejącym auth check (linia 34) i przed `return next()` (linia 36), który przekierowuje niezalogowanych adminów (user jest, ale role !== 'admin') na `/dashboard`. Dodać `/admin` do PROTECTED_ROUTES.

**Kontrakt**:
- `PROTECTED_ROUTES` (linia 4): dodać `"/admin"` do tablicy — obsługuje redirect do `/auth/signin` dla niezalogowanych
- Między liniami 34–36: dodać `if (context.url.pathname.startsWith('/admin') && context.locals.role !== 'admin') return context.redirect('/dashboard')`
- Nie modyfikować logiki dla `/dashboard` ani `/lessons`

#### 2. AdminLayout

**Plik**: `src/layouts/AdminLayout.astro` (nowy)

**Cel**: Layout dla wszystkich stron `/admin/*`. Zawiera sidebar z linkami do każdego poziomu hierarchii oraz slot na content strony.

**Kontrakt**:
- Props: `title?: string`
- Extends bare `Layout.astro` przez import lub duplikuje HTML shell (preferuj bezpośredni HTML shell, nie import Layout — unika podwójnego `<slot>`)
- Sidebar linki (pionowe menu lewe): `Książki → /admin/books`, `Rozdziały → /admin/chapters`, `Lekcje → /admin/lessons`, `Ćwiczenia → /admin/exercises`
- Topbar: tytuł "Panel admina" + link "Wróć do kursu" → `/dashboard`
- Styl: Tailwind v4 tokeny (`bg-background`, `border-border`, `text-foreground`) — nie kopiować dark/purple stylu z auth pages

#### 3. Strona wejściowa /admin

**Plik**: `src/pages/admin/index.astro` (nowy)

**Cel**: Redirect natychmiastowy do `/admin/books`.

**Kontrakt**: Frontmatter zwraca `return Astro.redirect('/admin/books')`.

#### 4. Shadcn form primitives

**Cel**: Zainstalować brakujące komponenty shadcn: `Input`, `Textarea`, `Select`, `Label` — używane we wszystkich admin formularzach.

**Kontrakt**: Uruchomić `npx shadcn add input textarea select label` — tworzy pliki w `src/components/ui/`. Nie modyfikować ręcznie generowanych plików.

### Kryteria sukcesu

#### Weryfikacja automatyczna
- `npm run build` przechodzi bez błędów TypeScript
- Pliki `src/components/ui/input.tsx`, `textarea.tsx`, `select.tsx`, `label.tsx` istnieją

#### Weryfikacja ręczna
- Zalogowany student (`student@bet.local`) odwiedzający `/admin` → redirect na `/dashboard`
- Niezalogowany użytkownik odwiedzający `/admin` → redirect na `/auth/signin`
- Zalogowany admin (`admin@bet.local`) odwiedzający `/admin` → redirect na `/admin/books` (strona jeszcze pusta/404 — OK)
- AdminLayout renderuje się poprawnie z sidebarrem po ręcznym stworzeniu testowej strony

---

## Faza 2: Książki i Rozdziały CRUD

### Przegląd

Pełny CRUD dla `books` i `chapters`. Po tej fazie admin może tworzyć hierarchię do poziomu rozdziałów: Książki → wybierz książkę → Rozdziały → stwórz/edytuj/usuń rozdział.

### Wymagane zmiany

#### 1. API routes — Books

**Pliki**: `src/pages/api/admin/books/index.ts`, `src/pages/api/admin/books/[id].ts` (nowe)

**Cel**: Obsługa CRUD dla `books`. Każda operacja sprawdza `locals.role !== 'admin'` (403), waliduje Zod, wykonuje operację Supabase.

**Kontrakt — `POST /api/admin/books` (index.ts)**:
- Body: `application/x-www-form-urlencoded` (z native form) lub `application/json` (z fetch)
- Zod schema: `{ title: z.string().min(1), cover_url: z.string().url().optional().or(z.literal('')), description: z.string().optional() }`
- Operacja: `supabase.from('books').insert({ title, cover_url: cover_url || null, description: description || null })`
- Sukces: `Response.redirect(new URL('/admin/books', request.url), 302)`
- Błąd walidacji/DB: `Response.redirect(new URL('/admin/books/new?error=...', request.url), 302)`
- `cover_url` puste string → `null` w DB

**Kontrakt — `PATCH /api/admin/books/[id]` + `DELETE /api/admin/books/[id]` ([id].ts)**:
- PATCH: body jak POST, operacja `supabase.from('books').update({...}).eq('id', params.id)`, redirect → `/admin/books`
- DELETE: brak body, operacja `supabase.from('books').delete().eq('id', params.id)`, response JSON `{ ok: true }`; caller robi `location.href`
- Params: `params.id` — UUID books (brak walidacji uuid format, analogicznie do S-01 permissive regex pattern)

#### 2. Strony — Books

**Pliki**: `src/pages/admin/books/index.astro`, `src/pages/admin/books/new.astro`, `src/pages/admin/books/[id]/edit.astro` (nowe)

**Cel**: Lista + formularze CRUD dla książek.

**Kontrakt — `books/index.astro`**:
- Query: `supabase.from('books').select('id, title, cover_url, description, created_at').order('created_at')`
- Wyświetla tabelę/listę książek z linkami: "Rozdziały" → `/admin/chapters?book_id={id}`, "Edytuj" → `/admin/books/{id}/edit`, przycisk "Usuń" (delete fetch)
- Przycisk "Nowa książka" → `/admin/books/new`
- Layout: `<AdminLayout title="Książki">`

**Kontrakt — `books/new.astro`**:
- Formularz HTML: `method="post" action="/api/admin/books"`
- Pola: `Input name="title"` (required), `Input name="cover_url" type="url"` (optional), `Textarea name="description"` (optional)
- Czyta `Astro.url.searchParams.get('error')` → pokazuje `<ServerError>` jeśli present
- Label + Input z shadcn primitives

**Kontrakt — `books/[id]/edit.astro`**:
- Frontmatter: query `supabase.from('books').select().eq('id', params.id).single()` → 404 jeśli brak
- Formularz: jak `new.astro`, ale `action="/api/admin/books/{id}"` + `method="post"` + hidden input `_method=PATCH`... 

Uwaga: Astro native forms nie obsługują PATCH bezpośrednio. Zamiast `_method` override: dla edit form, użyj osobnego API route pattern — formularz POSTuje do `/api/admin/books/{id}/edit` który wewnętrznie robi UPDATE. Lub prostsze: API route `[id].ts` odczytuje method z `request.method` — edit form powinien targetować endpoint który akceptuje POST i robi UPDATE.

**Uproszczenie dla edit forms**: API route `[id].ts` eksportuje `POST` handler (zamiast PATCH) dla form submission — wewnętrznie robi UPDATE. DELETE przez fetch onclick. Unika problemów z HTML forms i metod PUT/PATCH.

Kontrakt dla `[id].ts`:
- `POST` → UPDATE (from edit form)
- `DELETE` → DELETE (from fetch onclick)

#### 3. API routes — Chapters

**Pliki**: `src/pages/api/admin/chapters/index.ts`, `src/pages/api/admin/chapters/[id].ts` (nowe)

**Cel**: Analogiczne do books. Chapters wymagają `book_id` (from query param w formularzu) i `ord` (auto-append).

**Kontrakt — `POST /api/admin/chapters`**:
- Zod schema: `{ book_id: z.string().min(1), title: z.string().min(1) }`
- Ord: `SELECT COALESCE(MAX(ord), -1) + 1 FROM chapters WHERE book_id = $book_id`
- Insert: `{ book_id, title, ord }`
- Redirect: `/admin/chapters?book_id={book_id}`

**Kontrakt — `POST /api/admin/chapters/[id]` (update)**:
- Zod schema: `{ title: z.string().min(1), book_id: z.string().min(1) }` (book_id do redirect)
- Operacja: UPDATE title (nie zmieniamy ord ani book_id)
- Redirect: `/admin/chapters?book_id={book_id}`

**Kontrakt — `DELETE /api/admin/chapters/[id]`**:
- Operacja: DELETE (CASCADE → lessons → exercises → keys)
- Response: JSON `{ ok: true }`

#### 4. Strony — Chapters

**Pliki**: `src/pages/admin/chapters/index.astro`, `src/pages/admin/chapters/new.astro`, `src/pages/admin/chapters/[id]/edit.astro` (nowe)

**Cel**: Lista + formularze CRUD dla rozdziałów, zawsze w kontekście `book_id`.

**Kontrakt — `chapters/index.astro`**:
- Czyta `book_id` z `Astro.url.searchParams.get('book_id')` — jeśli brak, redirect → `/admin/books`
- Query: books (title dla breadcrumb) + chapters filtered by book_id, ordered by ord
- Wyświetla: breadcrumb (Książki → {book.title}), lista rozdziałów z linkami "Lekcje" → `/admin/lessons?chapter_id={id}`, "Edytuj", "Usuń"
- Przycisk "Nowy rozdział" → `/admin/chapters/new?book_id={book_id}`

**Kontrakt — `chapters/new.astro`**:
- Czyta `book_id` z searchParams → hidden input `<input type="hidden" name="book_id" value={book_id}>`
- Formularz: `Input name="title"` + hidden book_id
- action: `/api/admin/chapters`

**Kontrakt — `chapters/[id]/edit.astro`**:
- Query: chapter by id (include book_id) + parent book (title)
- Formularz: `Input name="title"` + hidden `book_id` + hidden `_target=/admin/chapters?book_id=...`
- action: `/api/admin/chapters/{id}`

### Kryteria sukcesu

#### Weryfikacja automatyczna
- `npm run build` przechodzi
- `npm run typecheck` bez błędów

#### Weryfikacja ręczna
- Admin tworzy nową książkę z tytułem, cover URL i opisem → widzi ją na liście `/admin/books`
- Admin klika "Rozdziały" przy książce → widzi `/admin/chapters?book_id=X` z breadcrumbem
- Admin tworzy rozdział → pojawia się na liście z `ord=0`; drugi rozdział ma `ord=1`
- Admin edytuje tytuł rozdziału → zmiana widoczna
- Admin usuwa rozdział → redirect na listę, rozdział zniknął, kaskadowe usunięcie lekcji/ćwiczeń
- Nowo stworzona książka widoczna w dashboard studenta (seeding `user_book_access` nie jest wymagany — dashboard query może wymagać korekty jeśli filtruje przez user_book_access; sprawdź)

---

## Faza 3: Lekcje CRUD z Markdown

### Przegląd

Pełny CRUD dla `lessons` z edytorem Markdown (textarea + live preview przez `marked`). Po tej fazie admin może pisać treść lekcji, która jest natychmiastowo widoczna w student render path (bez zmian w `marked.parse`).

### Wymagane zmiany

#### 1. MarkdownEditor island

**Plik**: `src/components/admin/MarkdownEditor.tsx` (nowy)

**Cel**: React island renderujący Markdown textarea po lewej + live HTML preview po prawej. Preview używa `marked.parse` client-side.

**Kontrakt**:
- Props: `name: string` (name atrybutu dla form submission), `defaultValue?: string`, `className?: string`
- State: `value: string` (content)
- Layout: `grid grid-cols-2 gap-4` lub `flex gap-4` z oboma panelami; textarea `h-64` minimum
- Preview: `<div dangerouslySetInnerHTML={{ __html: marked.parse(value) }} className="prose..." />`
- Hidden input: `<input type="hidden" name={name} value={value} />` dla form submission (native form)
- Import: `import { marked } from 'marked'` — bezpieczne w browser-only island (`client:load`)
- Brak scoped `<style>` dla prose — użyj inline Tailwind klas dla podstawowego formatowania preview (np. `[&_h2]:text-xl [&_p]:mb-2`)

#### 2. API routes — Lessons

**Pliki**: `src/pages/api/admin/lessons/index.ts`, `src/pages/api/admin/lessons/[id].ts` (nowe)

**Cel**: CRUD dla `lessons`. Analogiczny pattern do chapters.

**Kontrakt — `POST /api/admin/lessons`**:
- Zod schema: `{ chapter_id: z.string().min(1), title: z.string().min(1), content: z.string().min(1) }`
- Ord: `SELECT COALESCE(MAX(ord), -1) + 1 FROM lessons WHERE chapter_id = $chapter_id`
- Insert: `{ chapter_id, title, content, ord }`
- Redirect: `/admin/lessons?chapter_id={chapter_id}`

**Kontrakt — `POST /api/admin/lessons/[id]` (update)**:
- Zod schema: `{ title: z.string().min(1), content: z.string().min(1), chapter_id: z.string().min(1) }`
- Operacja: UPDATE title, content
- Redirect: `/admin/lessons?chapter_id={chapter_id}`

**Kontrakt — `DELETE /api/admin/lessons/[id]`**:
- Operacja: DELETE (CASCADE → exercises → keys)
- Response: JSON `{ ok: true }`

#### 3. Strony — Lessons

**Pliki**: `src/pages/admin/lessons/index.astro`, `src/pages/admin/lessons/new.astro`, `src/pages/admin/lessons/[id]/edit.astro` (nowe)

**Cel**: Lista + formularze CRUD dla lekcji, zawsze w kontekście `chapter_id`.

**Kontrakt — `lessons/index.astro`**:
- Czyta `chapter_id` z searchParams — jeśli brak, redirect → `/admin/chapters`
- Query: chapter (title, book_id) + parent book (title) + lessons ordered by ord
- Breadcrumb: Książki → {book.title} → Rozdziały → {chapter.title}
- Lista lekcji: tytuł, skrócony content preview (np. pierwsze 60 znaków), linki "Ćwiczenia" → `/admin/exercises?lesson_id={id}`, "Edytuj", "Usuń"
- Przycisk "Nowa lekcja" → `/admin/lessons/new?chapter_id={chapter_id}`

**Kontrakt — `lessons/new.astro`**:
- Czyta `chapter_id` z searchParams
- Formularz: `Input name="title"` + `<MarkdownEditor client:load name="content" />` + hidden `chapter_id`
- action: `/api/admin/lessons`

**Kontrakt — `lessons/[id]/edit.astro`**:
- Query: lesson by id (include chapter_id, content)
- Formularz: tytuł + `<MarkdownEditor client:load name="content" defaultValue={lesson.content} />` + hidden `chapter_id`
- action: `/api/admin/lessons/{id}`

### Kryteria sukcesu

#### Weryfikacja automatyczna
- `npm run build` przechodzi
- `npm run typecheck` bez błędów

#### Weryfikacja ręczna
- Admin tworzy lekcję z Markdown treścią (np. `# Tytuł\n\nTreść **pogrubiona**`) → preview renderuje HTML na żywo
- Zapisana lekcja widoczna w student render path (`/lessons/{id}`) z poprawnie renderowanym HTML
- Lekcja pojawia się na dashboardzie studenta jako dostępna (przy założeniu book access)
- Edit: istniejąca treść pre-loaded w textarea i preview
- Usuń lekcję → cascade usuwa ćwiczenia

---

## Faza 4: Ćwiczenia i Klucze Odpowiedzi CRUD

### Przegląd

Pełny CRUD dla `exercises` z dynamicznym formularzem (`ExerciseForm` island) obsługującym trzy typy (MC, FIB, T/F) i zarządzaniem kluczami odpowiedzi na tym samym formularzu.

### Wymagane zmiany

#### 1. ExerciseForm island

**Plik**: `src/components/admin/ExerciseForm.tsx` (nowy)

**Cel**: React island dla formularza ćwiczeń. Obsługuje warunkowe pola payload i klucze odpowiedzi zależnie od wybranego typu. Submituje przez `fetch`.

**Kontrakt — Props**:
```ts
interface ExerciseFormProps {
  lessonId: string;
  exerciseId?: string; // jeśli edit mode
  initialType?: 'multiple_choice' | 'fill_in_blank' | 'true_false';
  initialPrompt?: string;
  initialOptions?: string[];   // MC only
  initialKeys?: string[];      // key_text values
  redirectTo: string;          // po submit → location.href
}
```

**Kontrakt — State**:
- `type`: 'multiple_choice' | 'fill_in_blank' | 'true_false'
- `prompt`: string
- `options`: string[] (MC only — lista opcji; minimum 2, default 4 puste stringi)
- `correctOption`: string (MC only — key_text musi być jedną z options)
- `fibKeys`: string[] (FIB only — lista dopuszczalnych odpowiedzi; minimum 1)
- `tfKey`: 'true' | 'false' (T/F only)
- `error`: string | null
- `submitting`: boolean

**Kontrakt — UI per typ**:
- MC: lista `options` (każda: `<input>` + radio "Poprawna" + przycisk "Usuń") + przycisk "Dodaj opcję"; minimum 2 opcje
- FIB: lista `fibKeys` (każda: `<input>` + przycisk "Usuń") + przycisk "Dodaj klucz"; minimum 1 klucz; prompt textarea z notą o `_____` dla blank
- T/F: brak extra payload fields; radio group "Poprawna odpowiedź: ○ Prawda ○ Fałsz"

**Kontrakt — Submit**:
```ts
// POST /api/admin/exercises (create) lub POST /api/admin/exercises/{id} (update)
body = JSON.stringify({
  lesson_id: lessonId,
  type,
  prompt,
  payload: type === 'multiple_choice' ? { options } : {},
  keys: type === 'multiple_choice'
    ? [correctOption]
    : type === 'fill_in_blank'
    ? fibKeys
    : [tfKey]
})
```
- Sukces: `location.href = redirectTo`
- Błąd: `setError(responseJson.error)`

**Kontrakt — Walidacja client-side przed submit**:
- MC: `options.filter(Boolean).length >= 2 && correctOption && options.includes(correctOption)`
- FIB: `fibKeys.filter(Boolean).length >= 1`
- T/F: `tfKey` zawsze valid

#### 2. API routes — Exercises

**Pliki**: `src/pages/api/admin/exercises/index.ts`, `src/pages/api/admin/exercises/[id].ts` (nowe)

**Cel**: CRUD dla `exercises` + `exercise_keys` razem.

**Kontrakt — `POST /api/admin/exercises` (index.ts)**:
- Body: JSON (`application/json` z fetch)
- Zod schema:
  ```ts
  z.object({
    lesson_id: z.string().min(1),
    type: z.enum(['multiple_choice', 'fill_in_blank', 'true_false']),
    prompt: z.string().min(1),
    payload: z.record(z.unknown()), // {} lub {options: string[]}
    keys: z.array(z.string().min(1)).min(1),
  })
  ```
- Ord exercise: `SELECT COALESCE(MAX(ord), -1) + 1 FROM exercises WHERE lesson_id = $lesson_id`
- Insert exercise → get `exercise.id`
- Insert keys (sequential): `keys.map((key_text, ord) => supabase.from('exercise_keys').insert({ exercise_id, key_text, ord }))`
- Walidacja MC: `payload.options.includes(keys[0])` — jeśli nie, return 400 `{ error: 'Klucz musi być jedną z opcji' }`
- Sukces: `Response.json({ ok: true })`
- Błąd: `Response.json({ error: string }, { status: 400 })`

**Kontrakt — `POST /api/admin/exercises/[id]` (update)**:
- Body: JSON, identyczny schema jak POST
- Sekwencja: (1) UPDATE exercise (type, prompt, payload), (2) DELETE exercise_keys WHERE exercise_id, (3) INSERT nowych keys
- Walidacja MC: jak wyżej
- Sukces: `Response.json({ ok: true })`

**Kontrakt — `DELETE /api/admin/exercises/[id]`**:
- Operacja: DELETE exercise (CASCADE → exercise_keys)
- Sukces: `Response.json({ ok: true })`

#### 3. Strony — Exercises

**Pliki**: `src/pages/admin/exercises/index.astro`, `src/pages/admin/exercises/new.astro`, `src/pages/admin/exercises/[id]/edit.astro` (nowe)

**Cel**: Lista + formularze CRUD dla ćwiczeń, zawsze w kontekście `lesson_id`.

**Kontrakt — `exercises/index.astro`**:
- Czyta `lesson_id` z searchParams — jeśli brak, redirect → `/admin/lessons`
- Query: lesson (title, chapter_id) + chapter (title, book_id) + book (title) + exercises ordered by ord + exercise_keys per exercise
- Breadcrumb: Książki → {book} → Rozdziały → {chapter} → Lekcje → {lesson}
- Lista ćwiczeń: typ badge, prompt (60 znaków), liczba kluczy, linki "Edytuj", "Usuń"
- Przycisk "Nowe ćwiczenie" → `/admin/exercises/new?lesson_id={lesson_id}`

**Kontrakt — `exercises/new.astro`**:
- Czyta `lesson_id` z searchParams
- Renderuje `<ExerciseForm client:load lessonId={lesson_id} redirectTo={"/admin/exercises?lesson_id=" + lesson_id} />`

**Kontrakt — `exercises/[id]/edit.astro`**:
- Query: exercise by id (include lesson_id, type, prompt, payload) + exercise_keys ordered by ord
- Renderuje `<ExerciseForm client:load exerciseId={id} lessonId={...} initialType={type} initialPrompt={prompt} initialOptions={payload.options} initialKeys={keys.map(k => k.key_text)} redirectTo={...} />`

### Kryteria sukcesu

#### Weryfikacja automatyczna
- `npm run build` przechodzi
- `npm run typecheck` bez błędów

#### Weryfikacja ręczna
- Admin tworzy ćwiczenie MC z 4 opcjami, wskazuje poprawną → API zapisuje exercise + 1 key
- Student rozwiązuje to ćwiczenie (MC) na stronie lekcji → weryfikacja przez `/api/exercises/verify` działa poprawnie (key_text matches)
- Admin tworzy ćwiczenie FIB z 2 kluczami → obie odpowiedzi akceptowane przy weryfikacji
- Admin tworzy ćwiczenie T/F → klucz "true"/"false" zapisany
- Edit: formularz pre-loaded z istniejącymi danymi (opcje, klucze)
- Usuń: ćwiczenie znika z listy, kaskadowo usunięte klucze

---

## Strategia testowania

### Testy jednostkowe

Brak automatycznych testów jednostkowych (projekt nie ma test runner — sprawdź package.json). Cała weryfikacja manualna.

### Kroki testowania ręcznego (end-to-end flow)

1. Zaloguj jako `admin@bet.local` / `admin-pass`
2. Wejdź na `/admin` → sprawdź redirect do `/admin/books`
3. Stwórz książkę (tytuł: "Testowa Książka", cover URL: dowolny, opis: opcjonalny)
4. Kliknij "Rozdziały" → stwórz 2 rozdziały ("Rozdział 1", "Rozdział 2") → sprawdź ord (0, 1)
5. Kliknij "Lekcje" dla Rozdziału 1 → stwórz lekcję z Markdown treścią
6. Sprawdź live preview w edytorze → sprawdź `/lessons/{id}` zalogowany jako student
7. Kliknij "Ćwiczenia" → stwórz MC z 4 opcjami → zaznacz poprawną → zapisz
8. Jako student: rozwiąż ćwiczenie → weryfikuj poprawną odpowiedź → ukończ lekcję
9. Wróć jako admin: edytuj ćwiczenie → zmień opcje + klucz → student retry
10. Usuń ćwiczenie → lekcja nadal dostępna
11. Zaloguj jako `student@bet.local` → wejdź `/admin` → potwierdzić redirect `/dashboard`

---

## Uwagi dotyczące wydajności

Lista ćwiczeń z kluczami: jeden JOIN query (`exercises` + `exercise_keys`) zamiast N+1 — `supabase.from('exercises').select('*, exercise_keys(*)')`. Supabase JS obsługuje zagnieżdżone selects.

## Uwagi dotyczące migracji

Brak zmian w schema DB — wszystkie tabele i RLS policies gotowe. Istniejące seed data niezmienione.

## Referencje

- Powiązane badania: `context/changes/admin-content-creation/research.md`
- Middleware: `src/middleware.ts:4,30–36`
- Supabase client: `src/lib/supabase.ts:5`
- Exercise type enum: `supabase/migrations/20260625184555_init.sql:32–39`
- Admin RLS policies: migration:310–391
- Form pattern reference: `src/components/auth/SignInForm.tsx`
- Exercise payload reference (S-01): `src/pages/api/exercises/verify.ts`
- Dashboard query pattern: `src/pages/dashboard.astro`

---

## Postęp

> Konwencja: `- [ ]` oczekujące, `- [x]` wykonane. Dodaj ` — <commit sha>`, gdy krok zostanie zrealizowany. Nie zmieniaj nazw tytułów kroków.

### Faza 1: Infrastruktura

#### Automatyczne
- [x] 1.1 `npm run build` przechodzi bez błędów TypeScript — acf4541
- [x] 1.2 Pliki `src/components/ui/input.tsx`, `textarea.tsx`, `select.tsx`, `label.tsx` istnieją — acf4541

#### Ręczne
- [ ] 1.3 Student odwiedzający `/admin` → redirect `/dashboard`
- [ ] 1.4 Niezalogowany odwiedzający `/admin` → redirect `/auth/signin`
- [ ] 1.5 Admin odwiedzający `/admin` → redirect `/admin/books`

### Faza 2: Książki i Rozdziały

#### Automatyczne
- [x] 2.1 `npm run build` przechodzi
- [x] 2.2 `npm run typecheck` bez błędów

#### Ręczne
- [ ] 2.3 Admin tworzy książkę → widoczna na liście `/admin/books`
- [ ] 2.4 Admin tworzy dwa rozdziały → ord auto-przypisany (0, 1)
- [ ] 2.5 Admin edytuje tytuł rozdziału → zmiana widoczna
- [ ] 2.6 Admin usuwa rozdział → kaskadowe usunięcie lekcji/ćwiczeń

### Faza 3: Lekcje

#### Automatyczne
- [ ] 3.1 `npm run build` przechodzi
- [ ] 3.2 `npm run typecheck` bez błędów

#### Ręczne
- [ ] 3.3 Admin tworzy lekcję z Markdown → live preview działa
- [ ] 3.4 Lekcja widoczna w student render path z poprawnym HTML
- [ ] 3.5 Edit: istniejąca treść pre-loaded w edytorze

### Faza 4: Ćwiczenia i Klucze

#### Automatyczne
- [ ] 4.1 `npm run build` przechodzi
- [ ] 4.2 `npm run typecheck` bez błędów

#### Ręczne
- [ ] 4.3 Admin tworzy ćwiczenie MC → student może je rozwiązać poprawnie
- [ ] 4.4 Admin tworzy ćwiczenie FIB z 2 kluczami → oba akceptowane
- [ ] 4.5 Admin tworzy ćwiczenie T/F → klucz zapisany, weryfikacja działa
- [ ] 4.6 Edit ćwiczenia → formularz pre-loaded, zmiana klucza skutkuje nową odpowiedzią poprawną
