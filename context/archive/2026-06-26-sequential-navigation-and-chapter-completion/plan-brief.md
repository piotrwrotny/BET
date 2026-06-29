# S-05: Nawigacja sekwencyjna i ukończenie rozdziału — Krótki plan

> Pełny plan: `context/changes/sequential-navigation-and-chapter-completion/plan.md`
> Badania: `context/changes/sequential-navigation-and-chapter-completion/research.md`

## Co i dlaczego

Dodajemy do BET nawigację prev/next między lekcjami, widoczny agregat ukończenia rozdziału i per-chapter progress na dashboardzie. To domyka FR-012, FR-013, FR-016, FR-017 z PRD — student może płynnie przechodzić przez książkę bez wracania do dashboardu i widzi kiedy ukończył cały rozdział.

## Punkt wyjścia

Dashboard "Kontynuuj naukę" i "Gratulacje, książka ukończona!" już działają (S-01). View `chapter_progress` istnieje w DB od F-01. Strona lekcji ma inline header z linkiem "← Dashboard" i badge "✓ Ukończona" — tu wejdą przyciski prev/next i badge rozdziału.

## Pożądany stan końcowy

Student na stronie lekcji widzi przyciski `← {poprzednia}` / `{następna} →` w nagłówku (z nazwą rozdziału na granicy). Badge `✓ Rozdział ukończony!` pojawia się gdy wszystkie lekcje rozdziału done. Dashboard pod każdą książką pokazuje listę rozdziałów z licznikiem `x/y lekcji` i znacznikiem ✓ przy ukończonych.

## Kluczowe podjęte decyzje

| Decyzja | Wybór | Dlaczego (1 zdanie) | Źródło |
|---|---|---|---|
| Label na granicy rozdziału | Zmień na `{chapter title} →` | Student widzi kontekst rozdziału, nie tylko anonimową lekcję | Plan |
| Lokalizacja badge rozdziału | Oba: strona lekcji + dashboard | FR-016 wymaga widoczności statusu; oba miejsca mają ten sam view w DB | Plan |
| Lokalizacja przycisków nav | Inline header strony lekcji | Header już istnieje, zero nowych komponentów | Badania + Plan |
| Detail dashboardu | Licznik x/y + badge (bez per-lekcja listy) | Balans czytelności i zakresu | Plan |
| Poprzednia lekcja | Zawsze dostępna | Student może wracać do materiałów bez ograniczeń | Plan |
| Implementacja | Pure Astro SSR, zero React islands | Nav to `<a href>` — brak potrzeby JS po stronie klienta | Badania |

## Zakres

**W zakresie:**
- Przyciski prev/next w nagłówku strony lekcji (w obrębie i między rozdziałami)
- Badge "✓ Rozdział ukończony!" na stronie lekcji
- Lista rozdziałów z `x/y lekcji` i badge ukończenia na dashboardzie
- Cross-chapter navigation ze zmienionym labelem na granicy

**Poza zakresem:**
- Zmiany schematu DB
- Nowe React islands / API endpoints
- Per-lekcja detail lista na dashboardzie
- `last_accessed_at` / "aktywna książka" w DB
- S-06/S-07 (fill_in_blank, true_false, sentence_transformation)

## Architektura / Podejście

Dwie pliki Astro SSR, zero nowych komponentów. Dane pobierane w frontmatter, przekazywane jako atrybuty HTML do `<a href>` linków i klasowych warunkowych elementów. Strona lekcji: 2-3 dodatkowe Supabase queries (siblings, warunkowe cross-chapter). Dashboard: +1 query na `chapter_progress` view.

```
[id].astro frontmatter:
  lesson query (rozszerzone o chapters.ord)
  → siblings query (lekcje w tym samym rozdziale)
  → conditional: prevChapter / nextChapter query na granicy
  → chapter_progress query
  → compute prevLesson / nextLesson / isChapterCompleted
  → render: header z prev/next + badges

dashboard.astro frontmatter:
  (istniejące: books, chapters+lessons, lesson_progress)
  + chapter_progress query
  → chapterProgressMap: Record<chapter_id, {total, completed, completed_at}>
  → render: chapter list pod każdą kartą książki
```

## Fazy w skrócie

| Faza | Co dostarcza | Kluczowe ryzyko |
|---|---|---|
| 1. Strona lekcji | Prev/next nav + badge rozdziału | `chapter_progress` może wymagać GRANT migracji (łatwy fix) |
| 2. Dashboard | Lista rozdziałów z progress | Brak — view gotowy, query analogiczny do fazy 1 |

**Wymagania wstępne:** F-01 done (✓), S-01 done (✓). `npm run dev` + Supabase local running.

**Szacowany wysiłek:** 1 sesja, 2 fazy. Faza 1 ~80% pracy.

## Otwarte ryzyka i założenia

- **`chapter_progress` GRANT**: brak jawnego GRANT w migracji; jeśli query zwróci 403 — nowa migracja `GRANT SELECT ON public.chapter_progress TO authenticated` (10 minut, nie wymaga `db reset`)
- **Cross-chapter query na granicy**: warunkowe queries na granicy rozdziału zakładają, że Supabase JS poprawnie obsługuje `maybeSingle()` + nested `lessons(...)` — potwierdzone wzorcem już użytym w dashboardzie

## Kryteria sukcesu (podsumowanie)

1. Kliknięcie `→` na ostatniej lekcji rozdziału 1 przenosi do pierwszej lekcji rozdziału 2 z poprawnym labelem `Rozdział 2: ...`
2. Badge `✓ Rozdział ukończony!` pojawia się na stronie lekcji po ukończeniu wszystkich lekcji rozdziału
3. Dashboard pokazuje `x/y lekcji` per rozdział z ✓ przy ukończonych
