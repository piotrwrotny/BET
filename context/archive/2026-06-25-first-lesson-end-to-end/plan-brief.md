# Student kończy pierwszą lekcję od początku do końca — Krótki plan

> Pełny plan: `context/changes/first-lesson-end-to-end/plan.md`

## Co i dlaczego

Budujemy minimalną pełną pętlę nauki (gwiazda przewodnia S-01): zalogowany student widzi swoją książkę na dashboardzie, trafia na stronę lekcji, czyta treść, wykonuje ćwiczenie multiple-choice i klika „Przeczytano" — lekcja oznacza się jako ukończona w `lesson_progress`. Pomyślne dostarczenie tego fragmentu dowodzi, że hipoteza Vision („student przerabia podręcznik rozdziałami z weryfikacją") działa od końca do końca.

## Punkt wyjścia

F-01 dostarczył pełny schemat (8 tabel + RLS + seed), wygenerowane typy TypeScript i działające auth. Dashboard to stub (email + sign out). Brak tras domenowych, brak komponentów ćwiczeń, brak `zod`/`marked` w deps, middleware zna `user` ale nie `role`.

## Pożądany stan końcowy

Student `student@bet.local` może zalogować się, zobaczyć „FCE Practice Book 1" na dashboardzie, kliknąć „Kontynuuj naukę", przeczytać treść lekcji (wyrenderowany HTML), zaznaczył opcję w ćwiczeniu multiple-choice, dostać feedback, kliknąć „Przeczytano" i zobaczyć badge „Ukończona ✓" — trwały, widoczny po odświeżeniu.

## Kluczowe podjęte decyzje

| Decyzja | Wybór | Dlaczego | Źródło |
|---|---|---|---|
| Renderer treści lekcji | `marked` — server-side, 0 JS | Zero bundle klienta; content admin-controlled, XSS ryzyko niskie | Plan |
| Weryfikacja odpowiedzi | Server-side API `POST /api/exercises/verify` | Klucze odpowiedzi nigdy w DOM (Guardrail deterministycznej weryfikacji) | Plan |
| Architektura strony lekcji | Astro SSR + jeden React island `LessonInteractive` | Treść bez JS; interaktywność tylko tam gdzie potrzebna — Astro islands pattern | Plan |
| Rola w middleware | `SELECT user_roles` w middleware → `Astro.locals.role` | Spójny z `Astro.locals.user`; dostępna wszędzie bez boilerplate | Plan |
| UX przycisku „Przeczytano" | Zawsze widoczny; alert przy kliknięciu gdy warunki niespełnione | Student zawsze widzi cel, dostaje jasny komunikat o blokadzie | Plan |
| Route lekcji | `/lessons/[id]` — płaski | UUID wystarczy; hierarchia URL w S-05 | Plan |
| Retry ćwiczenia | Nieograniczone próby; zaliczone gdy poprawna raz | Kurs przygotowawczy — student uczy się przez próbę, nie jest karany | Plan |
| Walidacja API | Zod | Standard ecosystem TS; potrzebny i w S-02; wzorzec od razu | Plan |

## Zakres

**W zakresie:**
- Middleware: `Astro.locals.role` z `user_roles`
- Dashboard: lista książek z `user_book_access` + „Kontynuuj naukę" → pierwsza nieukończona lekcja
- Strona `/lessons/[id]`: SSR, Markdown → HTML, props do wyspy
- React island `LessonInteractive` + `MultipleChoiceExercise`
- `POST /api/exercises/verify` — server-side porównanie z `exercise_keys`
- `POST /api/lessons/[id]/complete` — idempotentny INSERT do `lesson_progress`
- Tylko typ ćwiczenia `multiple_choice` jako interaktywny; pozostałe jako statyczny placeholder

**Poza zakresem:**
- Nawigacja next/prev (S-05)
- Procent postępu / profil (S-04)
- Typy ćwiczeń: fill-in-blank, true/false, sentence transformation, matching (S-06/S-07)
- Admin UI do treści (S-02)
- Optymalizacja N+1 na dashboardzie

## Architektura / Podejście

```
Browser                  Astro SSR                    Supabase
  │                          │                            │
  │── GET /dashboard ────────► query books + progress ──►│ (RLS: student widzi własne)
  │◄─ HTML (lista książek) ──│◄──────────────────────────│
  │                          │
  │── GET /lessons/[id] ─────► query lesson + exercises ─►│ (RLS: has_lesson_access)
  │◄─ HTML + React island ───│◄──────────────────────────│
  │                          │
  │── POST /api/exercises/verify ───────────────────────►│ query exercise_keys (RLS)
  │◄─ { correct: bool } ─────────────────────────────────│
  │                          │
  │── POST /api/lessons/[id]/complete ──────────────────►│ upsert lesson_progress (RLS)
  │◄─ { success: true } ─────────────────────────────────│
```

RLS enforces access at every layer. Anon key + user session = policies applied automatically.

## Fazy w skrócie

| Faza | Co dostarcza | Kluczowe ryzyko |
|---|---|---|
| 1. Infrastructure | `zod` + `marked` zainstalowane; `Astro.locals.role` typed i ustawiane w middleware | Brak — addytywna zmiana |
| 2. Dashboard rework | Lista książek z „Kontynuuj naukę" → pierwsza nieukończona lekcja | N+1 query pattern (akceptowalny w MVP) |
| 3. Lesson page SSR | `/lessons/[id]`, Markdown → HTML, redirect na brak dostępu | `marked.parse()` sync vs async API — użyj sync |
| 4. Exercise & Completion | MC island + verify API + complete API — pełna pętla E2E | Idempotentność `lesson_progress` (użyj `.upsert` z `ignoreDuplicates`) |

**Wymagania wstępne:** F-01 `status: implemented` (bet-data-foundation), Supabase running lokalnie (`npm run db:start`), seed zaaplikowany (`npm run db:reset`).

**Szacowany wysiłek:** ~2-3 sesje, 4 fazy, 8 nowych/zmodyfikowanych plików.

## Otwarte ryzyka i założenia

- `marked` v15 API (`marked.parse()`) jest synchroniczne — jeśli wersja wymaga async, przełącz na `await marked(content)`.
- Cloudflare Workers runtime może mieć ograniczenia dla niektórych Node.js APIs — `marked` jest pure JS bez Node deps, nie powinno być problemu.
- Open-ended exercises (lekcja 5 z seed) nie są interaktywne w S-01 — placeholder „Dostępne wkrótce" jest świadomą decyzją zakresu.

## Kryteria sukcesu (podsumowanie)

- Student wykonuje pełną pętlę E2E bez błędów JS w konsoli i bez widocznego Markdown w treści.
- `lesson_progress` ma wiersz dla `student@bet.local` po kliknięciu „Przeczytano".
- Po odświeżeniu strony lekcji — lekcja nadal oznaczona jako ukończona.
