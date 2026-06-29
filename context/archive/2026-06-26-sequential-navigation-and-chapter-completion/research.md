---
date: 2026-06-26T10:45:00+02:00
researcher: claude-sonnet-4.6
git_commit: cf90a57c94fbffb4169fe1e98678e579f769ba63
branch: dev
repository: BET
topic: "S-05: sequential lesson navigation, chapter completion aggregate, Continue learning"
tags: [research, codebase, navigation, chapters, lesson_progress, dashboard, astro, supabase]
status: complete
last_updated: 2026-06-26
last_updated_by: claude-sonnet-4.6
---

# Badanie: S-05 — Nawigacja sekwencyjna i ukończenie rozdziału

**Data**: 2026-06-26T10:45:00+02:00
**Git Commit**: cf90a57c94fbffb4169fe1e98678e579f769ba63
**Gałąź**: dev

## Pytanie badawcze

Jaki jest aktualny stan bazy kodu względem S-05 (nawigacja next/prev, agregat ukończenia rozdziału, "Kontynuuj naukę")? Co trzeba zbudować, jakie bazy są już gotowe i jakie są decyzje architektoniczne?

## Podsumowanie

**Już zrobione (zero pracy do powtórzenia):**
- Dashboard "Kontynuuj naukę" → pierwsza nieukończona lekcja: ✅ (`src/pages/dashboard.astro:92-111`)
- Dashboard "✓ Gratulacje, książka ukończona!" gdy `firstUnfinishedId === null`: ✅ (`src/pages/dashboard.astro:106-108`)
- View `chapter_progress` z agregacją ukończenia rozdziału (FR-016): ✅ (`supabase/migrations/…:219-238`)

**Do zbudowania:**
1. **Prev/next nawigacja na stronie lekcji** (FR-013) — brak jakichkolwiek danych o sąsiednich lekcjach
2. **Badge ukończenia rozdziału na stronie lekcji** (FR-016/FR-017) — view istnieje, nie jest nigdzie używany
3. **Dashboard — poziom rozdziału** (FR-016) — opcjonalne rozszerzenie; aktualnie tylko poziom książki

## Szczegółowe ustalenia

### 1. Strona lekcji — aktualny stan

**Plik**: `src/pages/lessons/[id].astro`

Lekcja jest pobierana jednym zapytaniem (`linia 19-29`):
```ts
supabase.from("lessons")
  .select(`
    id, title, content, ord,
    chapters ( id, title, book_id ),   // ← brak ord rozdziału!
    exercises ( id, type, prompt, payload, ord )
  `)
  .eq("id", id as string)
  .single()
```

**Problemy dla S-05:**
- `chapters` nie zawiera `ord` — konieczne do nawigacji cross-chapter
- Brak zapytania o lekcje w tym samym rozdziale (sąsiedzi)
- `lesson.ord` jest pobierane ale **nieużywane** na stronie lekcji (linia 45-47 — używane tylko do sortowania ćwiczeń)
- Nagłówek strony lekcji to **inline `<header>`** w szablonie (linia 87-100), nie komponent `Topbar.astro` — Topbar nie jest używany na stronie lekcji w ogóle

**Aktualny nagłówek lekcji** (`linia 87-100`): tylko `← Dashboard` link + badge "✓ Ukończona". Tu wejdą przyciski prev/next.

### 2. Dashboard — aktualny stan

**Plik**: `src/pages/dashboard.astro`

Zapytanie o rozdziały+lekcje (`linia 29-32`):
```ts
supabase.from("chapters")
  .select("id, book_id, ord, lessons(id, ord)")
  .order("ord", { ascending: true })
```
Pobiera `ord` rozdziałów i lekcji, ale **nie pobiera tytułów lekcji**.

Algorytm `firstUnfinishedId` (`linia 45-62`): iteruje rozdziały posortowane po `ord`, lekcje w rozdziale posortowane po `ord`, pierwsza bez `lesson_progress` = target.

Renderowanie karty książki (`linia 92-111`):
```astro
{book.firstUnfinishedId ? (
  <a href={`/lessons/${book.firstUnfinishedId}`}>Kontynuuj naukę →</a>
) : (
  <p>✓ Gratulacje, książka ukończona!</p>
)}
```
**FR-012 spełnione.** "Gratulacje" też gotowe.

**Brak**: per-chapter progress breakdown (lista rozdziałów z procentem/statusem).

### 3. Schemat DB — co wspiera S-05

**`chapters`** (`migration:77-84`):
- `id`, `book_id`, `title`, `ord`, `created_at`
- `UNIQUE(book_id, ord)` — implicit B-tree index pokrywa `WHERE book_id = X ORDER BY ord`

**`lessons`** (`migration:89-97`):
- `id`, `chapter_id`, `title`, `content`, `ord`, `created_at`
- `UNIQUE(chapter_id, ord)` — implicit index pokrywa `WHERE chapter_id = X ORDER BY ord`
- `UNIQUE(chapter_id, ord)` — gwarancja porządku, safe dla `ord < current` / `ord > current`

**`lesson_progress`** (`migration:128-133`):
- PK: `(user_id, lesson_id)` — composite
- Brak `UPDATE`/`DELETE` policy — immutable by design
- Brak `last_accessed_at` — brak kolumny "ostatnio odwiedzona lekcja" na jakiejkolwiek tabeli

**View `chapter_progress`** (`migration:219-238`):
```sql
create view public.chapter_progress as
select
  c.id as chapter_id,
  c.book_id,
  uba.user_id,
  count(distinct l.id) as lessons_total,
  count(distinct lp.lesson_id) as lessons_completed,
  case
    when count(distinct l.id) > 0
     and count(distinct l.id) = count(distinct lp.lesson_id)
    then max(lp.completed_at)
    else null
  end as completed_at
from public.chapters c
join public.user_book_access uba on uba.book_id = c.book_id
left join public.lessons l on l.chapter_id = c.id
left join public.lesson_progress lp
       on lp.lesson_id = l.id
      and lp.user_id = uba.user_id
group by c.id, c.book_id, uba.user_id;
```
- `SECURITY INVOKER` → RLS na `user_book_access` i `lesson_progress` filtruje do bieżącego użytkownika
- `completed_at IS NOT NULL` = cały rozdział ukończony
- Brak jawnego `GRANT` — Supabase domyślnie daje `authenticated` SELECT na `public.*`

### 4. RLS — istotne dla nowych zapytań

Lekcje: `is_admin() OR has_lesson_access(id)` — has_lesson_access sprawdza `user_book_access`. Zapytanie o lekcje w rozdziale (prev/next) przejdzie przez RLS poprawnie pod warunkiem, że student ma dostęp do książki.

Rozdziały: `is_admin() OR has_book_access(book_id)` — analogicznie.

Nowe zapytania o sąsiednie lekcje nie wymagają zmian RLS.

### 5. Routing Astro

Trasa `/lessons/[id]` jest SSR (`output: "server"` w `astro.config.mjs`). Wszystkie operacje w frontmatter `.astro` działają server-side. Przekazywanie `prevId`/`nextId` jako props do komponentów Astro lub jako atrybuty `href` do linków jest natywnym Astro pattern — zero JS na kliencie potrzebne dla nawigacji.

`/lessons` jest w `PROTECTED_ROUTES` (`middleware.ts:4`) — startsWith match obejmuje wszystkie `/lessons/*`.

## Odniesienia do kodu

- `src/pages/lessons/[id].astro:19-29` — zapytanie o lekcję (do rozszerzenia o `ord` rozdziału)
- `src/pages/lessons/[id].astro:81` — cast rozdziału (do dodania `ord`)
- `src/pages/lessons/[id].astro:87-100` — inline header (tu wejdą przyciski nav)
- `src/pages/dashboard.astro:29-32` — zapytanie o rozdziały+lekcje
- `src/pages/dashboard.astro:45-62` — algorytm firstUnfinishedId
- `src/pages/dashboard.astro:92-111` — karta książki z CTA
- `supabase/migrations/20260625184555_init.sql:77-84` — CREATE TABLE chapters
- `supabase/migrations/20260625184555_init.sql:89-97` — CREATE TABLE lessons
- `supabase/migrations/20260625184555_init.sql:128-133` — CREATE TABLE lesson_progress
- `supabase/migrations/20260625184555_init.sql:219-238` — VIEW chapter_progress

## Wnioski architektoniczne

### Prev/next data fetching — rekomendacja

**3 zapytania SSR** (wszystkie w frontmatter `[id].astro`):

1. (istniejące) Lekcja + `chapters(id, title, book_id, **ord**)` + exercises — rozszerzyć o `ord` rozdziału
2. (nowe) Lekcje w tym samym rozdziale: `SELECT id, title, ord FROM lessons WHERE chapter_id = $chapter_id ORDER BY ord`
   — zwraca wszystkie lekcje rozdziału; w app-logic wyznaczamy `prevId`/`nextId` po `ord`
3. (warunkowe, tylko na granicy rozdziału) Zapytanie o sąsiedni rozdział + jego graniczną lekcję:
   - Prev-chapter: `SELECT l.id FROM lessons l JOIN chapters c ON c.id = l.chapter_id WHERE c.book_id = $book_id AND c.ord < $chapter_ord ORDER BY c.ord DESC, l.ord DESC LIMIT 1`
   - Next-chapter: `SELECT l.id FROM lessons l JOIN chapters c ON c.id = l.chapter_id WHERE c.book_id = $book_id AND c.ord > $chapter_ord ORDER BY c.ord ASC, l.ord ASC LIMIT 1`

Alternatywa (single query CTE) byłaby efektywniejsza, ale Supabase JS nie wspiera surowych CTE przez `.from()` — wymagałoby `rpc()`. Przy małej liczbie lekcji (seed: 5 lekcji, 2 rozdziały) 3 zapytania są akceptowalne w MVP.

### Chapter completion badge — rekomendacja

Zapytać `chapter_progress` view po zapisaniu ukończenia lekcji. W Astro SSR — pobierać przy ładowaniu strony lekcji:

```ts
const { data: chapterProgress } = await supabase
  .from("chapter_progress")
  .select("lessons_total, lessons_completed, completed_at")
  .eq("chapter_id", chapter.id)
  .maybeSingle();
```

Wyświetlić badge w nagłówku lub po treści: "✓ Rozdział ukończony!" gdy `chapterProgress?.completed_at != null`.

### Dashboard chapter breakdown — decyzja

Aktualny dashboard pokazuje tylko poziom książki (jeden link "Kontynuuj naukę"). S-05 roadmap mówi o "agregat ukończenia rozdziału" — minimalnie wystarczy badge na stronie lekcji. Dashboard chapter breakdown (lista rozdziałów z progress barem) to S-04/S-05 overlap — można dodać ale nie jest blokerem.

### Brak `last_accessed_at` — implikacja

"Aktywna książka" nie istnieje w schemacie. Dashboard zakłada, że student ma dostęp do jednej lub kilku książek i "Kontynuuj naukę" prowadzi do pierwszej nieukończonej. Przy wielu książkach kolejność będzie alfabetyczna/insertion order. Dla S-05 nie jest blokerem — roadmap S-05 nie wymaga "aktywnej książki" explicite.

## Otwarte pytania

1. **Cross-chapter nav label** — gdy `nextId` jest pierwszą lekcją innego rozdziału, czy przycisk mówi "Następna lekcja →" czy "Następny rozdział: {title} →"? Różnica UX, nie architektury.
2. **Chapter progress w dashboardzie** — czy dashboard w S-05 powinien pokazać listę rozdziałów z progress (x/y lekcji)? `chapter_progress` view na to pozwala. Roadmap nie precyzuje głębokości widoku.
3. **`chapter_progress` GRANT** — view jest SECURITY INVOKER, brak jawnego GRANT w migracji. Supabase domyślnie daje `authenticated` SELECT na `public.*`. Zweryfikować przy pierwszym zapytaniu w dev.
