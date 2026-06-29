<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: S-01: Student kończy pierwszą lekcję od początku do końca

- **Plan**: `context/changes/first-lesson-end-to-end/plan.md`
- **Zakres**: Faza 1–4 z 4
- **Data**: 2026-06-26
- **Werdykt**: PASS
- **Ustalenia**: 1 krytyczne, 5 ostrzeżeń, 2 obserwacje

## Werdykty

| Wymiar | Werdykt |
|--------|---------|
| Zgodność z planem | PASS |
| Dyscyplina zakresu | PASS |
| Bezpieczeństwo i jakość | PASS |
| Architektura | PASS |
| Spójność wzorców | PASS |
| Kryteria sukcesu | PASS |

## Podsumowanie działań naprawczych

- F1: dodano `isomorphic-dompurify` i sanityzację `marked.parse()` w `src/pages/lessons/[id].astro`; dodano komentarz `eslint-disable-next-line astro/no-set-html-directive` z uzasadnieniem.
- F2: zmieniono `closedExerciseCount` na liczenie wszystkich ćwiczeń `type !== 'open_ended'`.
- F3: usunięto nawigację prev/next, badge „Rozdział ukończony" oraz tryb review (`correctAnswers` / `initialCorrectAnswer`) ze S-01.
- F4: dodano walidację UUID i rozróżniono 400/403/500 w `src/pages/api/lessons/[id]/complete.ts`.
- F5: dodano obsługę błędów query `exercise_keys` w `src/pages/api/exercises/verify.ts`.
- F6: dodano `pageError` + `<ServerError />` w `src/pages/dashboard.astro`.
- F7: dodano `export const prerender = false` do obu endpointów API.
- F8: zamieniono regex na `z.string().uuid()`, dodano `.max(2048)` i usunięto deprecated `.flatten()`.

## Pozostałe uwagi

- Linter raportuje `no-console` (logi błędów 500) — akceptowalne w API routes.
- Linter raportuje `astro/no-unused-css-selector` dla stylów `.lesson-content` — wynika z `set:html` i jest fałszywie pozytywny (selektory są używane w czasie runtime w sanityzowanym HTML).
- `npx tsc --noEmit` zgłasza 2 pre-existing błędy w `src/pages/api/admin/exercises/*.ts` (spoza zakresu S-01).

## Ustalenia

### F1 — `set:html` renderuje niesanityzowany Markdown, ryzyko stored XSS

- **Ważność**: ❌ CRITICAL
- **Wpływ**: 🔎 MEDIUM — prawdziwy kompromis; zatrzymaj się, aby to przemyśleć
- **Wymiar**: Bezpieczeństwo i jakość
- **Lokalizacja**: `src/pages/lessons/[id].astro:239`
- **Szczegóły**: Plan Fazy 3 przewiduje `marked.parse(lesson.content)` + `<Fragment set:html={contentHtml} />`. Implementacja robi dokładnie to, ale nie sanityzuje wyjścia `marked`. Administrator (lub ktoś z dostępem do edycji treści w przyszłości) może wstrzyknąć `<script>` lub inne złośliwe tagi do `lessons.content`, które zostaną wyrenderowane w przeglądarce studenta. Linter potwierdza: `astro/no-set-html-directive`.
- **Poprawka A ⭐ Zalecana**: Przepuść wyjście `marked.parse()` przez `isomorphic-dompurify` (lub podobną bibliotekę) server-side przed `set:html`.
  - Siła: Usuwa klasę stored XSS bez zmiany UX.
  - Kompromis: Dodaje jedną zależność (~30 kB).
  - Pewność: HIGH — standardowy wzorzec dla Markdown z niezaufanych źródeł.
  - Martwy punkt: Brak.
- **Poprawka B**: Zamiast `set:html`, renderuj Markdown przez komponent, który whitelistuje dozwolone tagi (np. własny parser astrowy).
  - Siła: Mniejsze ryzyko błędów sanitizera.
  - Kompromis: Więcej kodu; ogranicza formatowanie do whitelista.
  - Pewność: MEDIUM — wymaga utrzymania listy tagów.
  - Martwy punkt: Niezweryfikowane, które tagi są potrzebne.
- **Decyzja**: PENDING

### F2 — `closedExerciseCount` liczy tylko `multiple_choice`, a nie wszystkie non-`open_ended`

- **Ważność**: ⚠️ WARNING
- **Wpływ**: 🔎 MEDIUM
- **Wymiar**: Zgodność z planem
- **Lokalizacja**: `src/pages/lessons/[id].astro`
- **Szczegóły**: Plan Fazy 3 mówi: "Odfiltruj `open_ended` exercises przy liczeniu `closedExerciseCount`". To oznacza `type !== 'open_ended'`. Implementacja liczy `type === 'multiple_choice'`, więc lekcja z fill-in-blank lub true/false (bez MC) będzie mieć `closedExerciseCount = 0` i przycisk „Przeczytano" odblokuje się bez rozwiązania żadnego ćwiczenia.
- **Poprawka**: Zamień `exercises.filter((e) => e.type === 'multiple_choice').length` na `exercises.filter((e) => e.type !== 'open_ended').length`.
  - Siła: Zgodne z planem i FR-015.
  - Kompromis: Brak.
  - Pewność: HIGH — jedna linia.
  - Martwy punkt: Brak.
- **Decyzja**: PENDING

### F3 — Strona lekcji zawiera funkcje spoza zakresu S-01 (S-05 / review mode)

- **Ważność**: ⚠️ WARNING
- **Wpływ**: 🔬 HIGH — stawka architektoniczna; pomyśl dokładnie przed podjęciem decyzji
- **Wymiar**: Dyscyplina zakresu
- **Lokalizacja**: `src/pages/lessons/[id].astro`, `src/components/lesson/LessonInteractive.tsx`, `src/components/lesson/MultipleChoiceExercise.tsx`
- **Szczegóły**: Implementacja dodaje: nawigację prev/next między lekcjami (S-05), badge „Rozdział ukończony" (S-05), oraz `correctAnswers` / `initialCorrectAnswer` dla trybu review (nie w planie S-01). Plan wyraźnie wyklucza nawigację next/prev i agregat rozdziału w "Czego NIE robimy".
- **Poprawka A ⭐ Zalecana**: Usuń prev/next, chapter badge i `correctAnswers`/`initialCorrectAnswer` z S-01; przenieś te funkcje do dedykowanego change S-05.
  - Siła: Zachowuje ścisły zakres S-01; mniej kodu do zweryfikowania.
  - Kompromis: Traci już wykonaną pracę UI, ale zostaje ona w git history.
  - Pewność: HIGH — wymaga usunięcia propsów i fragmentów JSX.
  - Martwy punkt: Nie sprawdzono, czy inne komponenty zależą od `correctAnswers`.
- **Poprawka B**: Zostaw funkcje, ale zaktualizuj plan S-01, aby je uwzględnił jako zamierzony scope creep.
  - Siła: Zachowuje kod.
  - Kompromis: Plan staje się ruchomym celem; S-05 staje się mniejszy.
  - Pewność: MEDIUM — wymaga aktualizacji planu i uzgodnień.
  - Martwy punkt: Nie sprawdzono wpływu na S-05.
- **Decyzja**: PENDING

### F4 — `complete.ts` zwraca 403 dla błędów DB i nie waliduje UUID

- **Ważność**: ⚠️ WARNING
- **Wpływ**: 🏃 LOW — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Bezpieczeństwo i jakość
- **Lokalizacja**: `src/pages/api/lessons/[id]/complete.ts:17-31`
- **Szczegóły**: Wszystkie błędy Supabase (łącznie z błędami połączenia, timeoutami itp.) są zamieniane na `403 Forbidden`. Dodatkowo `lessonId` z `Astro.params` nie jest walidowany jako UUID przed użyciem w zapytaniu.
- **Poprawka**: Waliduj `lessonId` przez `z.string().uuid()`; zwracaj `400` dla złego formatu i `500` dla błędów DB; `403` tylko przy braku dostępu.
  - Siła: Poprawna semantyka HTTP i lepszy debug.
  - Kompromis: Brak.
  - Pewność: HIGH — standardowy wzorzec.
  - Martwy punkt: Brak.
- **Decyzja**: PENDING

### F5 — `verify.ts` nie sprawdza błędu query `exercise_keys`

- **Ważność**: ⚠️ WARNING
- **Wpływ**: 🏃 LOW
- **Wymiar**: Niezawodność
- **Lokalizacja**: `src/pages/api/exercises/verify.ts:40-51`
- **Szczegóły**: Gdy zapytanie do `exercise_keys` zwróci błąd, funkcja zwraca `{ correct: false }` zamiast 500. Student może dostać fałszywy feedback „niepoprawnie" z powodu awarii DB.
- **Poprawka**: Sprawdź `error` po query; jeśli istnieje, zaloguj i zwróć `500`.
  - Siła: Nie ukrywa awarii DB jako błędnych odpowiedzi.
  - Kompromis: Brak.
  - Pewność: HIGH — jeden blok if.
  - Martwy punkt: Brak.
- **Decyzja**: PENDING

### F6 — `dashboard.astro` ignoruje błędy Supabase

- **Ważność**: ⚠️ WARNING
- **Wpływ**: 🔎 MEDIUM
- **Wymiar**: Niezawodność
- **Lokalizacja**: `src/pages/dashboard.astro:23-57`
- **Szczegóły**: Błędy z `user_book_access`, `lessons` i `lesson_progress` są ignorowane; brak `supabase` renderuje pusty dashboard zamiast błędu. To jest niespójne z twardym błędem wprowadzonym w `admin/users` (Faza 2 tamtego change).
- **Poprawka**: Dodaj obsługę błędów przez `ServerError` lub redirect; fail closed przy błędach danych.
  - Siła: Spójne UX i widoczność awarii.
  - Kompromis: Wymaga drobnej refaktoryzacji frontmatter.
  - Pewność: HIGH — wzorzec z `admin/users`.
  - Martwy punkt: Brak.
- **Decyzja**: PENDING

### F7 — Nowe API routes bez `export const prerender = false`

- **Ważność**: 🔵 OBSERVATION
- **Wpływ**: 🏃 LOW
- **Wymiar**: Spójność wzorców
- **Lokalizacja**: `src/pages/api/exercises/verify.ts`, `src/pages/api/lessons/[id]/complete.ts`
- **Szczegóły**: Istniejące trasy admin API mają `export const prerender = false`; nowe endpointy ćwiczeń go nie deklarują. Astro z `output: server` prawdopodobnie domyślnie traktuje je jako dynamiczne, ale brak jawnej deklaracji jest niespójny.
- **Poprawka**: Dodaj `export const prerender = false` do obu endpointów.
  - Siła: Spójność z admin API i wyraźny kontrakt.
  - Kompromis: Brak.
  - Pewność: HIGH — dwie linie.
  - Martwy punkt: Brak.
- **Decyzja**: PENDING

### F8 — `verify.ts` używa przestarzałego `.flatten()` i `any` przez walidację regex

- **Ważność**: 🔵 OBSERVATION
- **Wpływ**: 🏃 LOW
- **Wymiar**: Spójność wzorców / Jakość
- **Lokalizacja**: `src/pages/api/exercises/verify.ts:9, 22, 58`
- **Szczegóły**: Walidacja `exercise_id` odbywa się przez ręczny regex zamiast `z.string().uuid()`, co daje typ `any` i błędy `no-unsafe-call`/`no-unsafe-member-access`. Dodatkowo `.flatten()` jest deprecated w Zod v4.
- **Poprawka**: Użyj `z.object({ exercise_id: z.string().uuid(), answer: z.string().min(1).max(2048) })`.
  - Siła: Czystszy kod, lepsze typy, zgodny z planem.
  - Kompromis: Brak.
  - Pewność: HIGH — prosta zamiana.
  - Martwy punkt: Brak.
- **Decyzja**: PENDING
