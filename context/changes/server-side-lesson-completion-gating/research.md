---
date: 2026-07-01T19:46:13Z
researcher: AI Assistant
git_commit: 9c3a05f
branch: module-4
repository: piotrwrotny/BET
topic: "Jak obecnie działa flow ukończenia lekcji (UI, API, baza) i co trzeba zmienić, żeby reguła ukończenia była egzekwowana po stronie serwera?"
tags: [research, codebase, lesson-completion, ddd, invariant, risk-6]
status: complete
last_updated: 2026-07-01
last_updated_by: AI Assistant
---

# Badanie: server-side lesson completion gating

**Data**: 2026-07-01T19:46:13Z
**Badacz**: AI Assistant
**Git Commit**: `9c3a05f`
**Gałąź**: `module-4`
**Repozytorium**: piotrwrotny/BET

## Pytanie badawcze

Jak obecnie działa flow ukończenia lekcji (UI, API, baza) i co trzeba zmienić, żeby reguła ukończenia była egzekwowana po stronie serwera?

## Podsumowanie

Dziś reguła ukończenia lekcji (FR-015) jest egzekwowana **wyłącznie w UI**. Komponent `LessonInteractive.tsx` blokuje przycisk „Przeczytano”, dopóki student nie rozwiąże wszystkich ćwiczeń zamkniętych, ale endpoint `POST /api/lessons/[id]/complete` zapisuje postęp w `lesson_progress` bez walidacji. To narusza granicę zaufania: każdy klient może oznaczyć lekcję jako ukończoną bez wykonania ćwiczeń. Najtańszym i najbezpieczniejszym rozwiązaniem jest wprowadzenie agregatu `LessonCompletion`, tabeli `exercise_submissions` utrwalającej poprawne odpowiedzi i przeniesienie inwariantu na serwer.

## Szczegółowe ustalenia

### UI/frontend — gating po stronie klienta

- `LessonInteractive` otrzymuje `closedExerciseCount` obliczoną po stronie serwera w `src/pages/lessons/[id].astro:54` jako liczbę ćwiczeń, których `type !== "open_ended"`.
- Przycisk „Przeczytano” jest wyłączony, gdy `completedExercises.size < closedExerciseCount` (`src/components/lesson/LessonInteractive.tsx:98`).
- Komponent trzyma lokalny stan `completedExercises: Set<string>` (`src/components/lesson/LessonInteractive.tsx:36`), który jest **resetowany po odświeżeniu strony** i **nie jest wysyłany na serwer**.
- `handleMarkRead` wykonuje pusty `POST` pod `/api/lessons/${lessonId}/complete` (`src/components/lesson/LessonInteractive.tsx:52`).
- `onCorrect(exerciseId)` jest wywoływany przez każdy komponent ćwiczenia zamkniętego dopiero po zweryfikowaniu odpowiedzi przez `POST /api/exercises/verify` (szczegóły w raportach pod-agentów).
- Ćwiczenia otwarte (`open_ended`) nigdy nie wywołują `onCorrect` i nie blokują ukończenia (`src/lib/verify-exercise.ts:73-82`).

### API i baza danych — brak walidacji po stronie serwera

- `POST /api/lessons/[id]/complete` (src/pages/api/lessons/[id]/complete.ts):
  - waliduje UUID lekcji i wymaga zalogowanego użytkownika;
  - wykonuje `upsert` do `lesson_progress` z `ignoreDuplicates: true`;
  - **nie sprawdza**, czy ćwiczenia zamknięte zostały rozwiązane.
- `POST /api/exercises/verify` (src/pages/api/exercises/verify.ts):
  - pobiera `type` ćwiczenia i klucze z `exercise_keys`;
  - zwraca `{ correct: boolean }`;
  - **nie utrwala** odpowiedzi ani wyniku.
- Schemat:
  - `public.exercises` — PK `id`, FK `lesson_id`, pole `type` enum (`src/lib/database.types.ts:304-310`).
  - `public.exercise_keys` — PK `id`, FK `exercise_id`, `key_text`, `key_metadata`.
  - `public.lesson_progress` — PK `(user_id, lesson_id)`, `completed_at`, brak polityk UPDATE/DELETE, co gwarantuje nieodwracalność.
- Funkcje RLS: `private.has_lesson_access` i `private.has_exercise_access` już egzekwują dostęp do lekcji/ćwiczeń na podstawie `user_book_access`.

### Testy i ryzyka

- Istniejący spec: `tests/integration/lesson-completion.spec.ts`.
  - Pozytywny przypadek: lekcja bez ćwiczeń może być ukończona.
  - Dokumentacja luki: lekcja z ćwiczeniem zamkniętym + otwartym może być ukończona bez rozwiązania (`tests/integration/lesson-completion.spec.ts:30-37`).
  - `test.skip("server rejects completion when closed exercises are unsolved")` czeka na implementację.
- Test-plan ryzyko #6: *Completion gating wrongly requires open-ended exercise or ignores a missing closed exercise*, wpływ **High** (`context/foundation/test-plan.md:47`).
- Najtańsza warstwa testowa: testy jednostkowe agregatu + test integracyjny/kontraktowy endpointu. E2E nie jest potrzebne dla tego inwariantu.
- Brakujące dane testowe: lekcja z wieloma ćwiczeniami zamkniętymi, lekcja tylko z otwartymi, zapisane poprawne `exercise_submissions`.

### Opcje projektowe

- **Opcja A — utrwalać poprawne odpowiedzi** (`exercise_submissions`): serwer staje się źródłem prawdy, naturalny audit trail, idempotentna, efektywna operacja ukończenia (`IN (exercise_ids)`). Wymaga migracji + RLS.
- **Opcja B — re-weryfikacja przy ukończeniu**: niemożliwa bez utrwalonych odpowiedzi; wymaga wysłania wszystkich odpowiedzi przez klienta, co odtwarza problem zaufania i psuje UX.
- **Rekomendacja**: Opcja A z agregatem `LessonCompletion` jako root.
- Inwariant powinien żyć w **eksplicytnej klasie agregatu + cienkim repozytorium**, a nie w triggerze DB ani surowej funkcji serwisowej. Triggery są trudne w testach i ukryte; funkcja serwisowa zaciera granicę agregatu.
- Idempotentność: `exercise_submissions` PK `(user_id, exercise_id)` + `lesson_progress` PK `(user_id, lesson_id)` z `ignoreDuplicates`.

## Odniesienia do kodu

- `src/components/lesson/LessonInteractive.tsx:36` — lokalny stan `completedExercises`.
- `src/components/lesson/LessonInteractive.tsx:46` — komunikat blokady przycisku.
- `src/components/lesson/LessonInteractive.tsx:52` — pusty POST do endpointu ukończenia.
- `src/components/lesson/LessonInteractive.tsx:98` — warunek `disabled` przycisku.
- `src/pages/lessons/[id].astro:54` — obliczenie `closedExerciseCount` po stronie serwera.
- `src/pages/api/lessons/[id]/complete.ts:27-32` — `upsert` do `lesson_progress` bez walidacji.
- `src/pages/api/exercises/verify.ts:46-67` — weryfikacja bez utrwalania wyniku.
- `src/lib/verify-exercise.ts:73-82` — `open_ended` zawsze zwraca `false`.
- `supabase/migrations/20260625184555_init.sql:135-140` — schemat `lesson_progress`.
- `supabase/migrations/20260625184555_init.sql:401-416` — brak UPDATE/DELETE RLS dla `lesson_progress`.
- `tests/integration/lesson-completion.spec.ts:30-37` — test dokumentujący obecną lukę.
- `tests/integration/lesson-completion.spec.ts:48-50` — pominięty test dla przyszłej bramki serwerowej.

## Wnioski architektoniczne

- **Core subdomain**: flow nauki studenta + weryfikacja odpowiedzi. To tu leży unikalna wartość BET; te warstwy powinny być najlepiej odizolowane od infrastruktury.
- **Granica zaufania**: nie można polegać na kliencie przy zapisywaniu postępu. Serwer musi być źródłem prawdy.
- **Nieodwracalność postępu** jest już chroniona przez brak UPDATE/DELETE RLS — należy ją zachować, nie dodając możliwości cofnięcia ukończenia.
- **Agregat** jest właściwym wzorcem: `LessonCompletion` jest jedynym strażnikiem reguły, co daje nazwane błędy domenowe i testowalność jednostkową.

## Kontekst historyczny

- `context/changes/refactor-opportunities/plan.md` — wcześniejszy refaktoryzym domenowy admina i schema constants; pokazuje konwencję test-first i rytuał commitów.
- `context/domain/02-invariant-aggregate-refactor.md` — poprzednia destylacja DDD wskazała ten sam inwariant #1 (server-side lesson completion gating) i zaprojektowała agregat `LessonCompletion`.
- `context/foundation/test-plan.md` — ryzyko #6 definiuje dokładnie to zagrożenie i wskazuje integrację jako najtańszą warstwę.

## Powiązane badania

- `context/domain/01-domain-distillation.md` — mapa domeny BET, klasyfikacja poddomen, Ubiquitous Language.
- `context/domain/02-invariant-aggregate-refactor.md` — szczegółowy projekt agregatu i plan refaktoryzacji inwariantu.

## Otwarte pytania

1. Czy admin może edytować klucze ćwiczeń po tym, jak studenci już rozwiązali zadania? Jeśli tak, czy `exercise_submissions` powinno przechowywać `is_correct_at_submission_time` i ewentualnie re-weryfikować przy ukończeniu?
2. Czy studenci powinni widzieć historię swoich prób, czy tylko fakt rozwiązania?
3. Czy przycisk „Przeczytano” w UI powinien nadal być głównym wyzwalaczem, czy lekcja powinna ukończyć się automatycznie po ostatnim poprawnym ćwiczeniu?
4. Jaki powinien być kod błędu HTTP dla `ClosedExercisesNotSolvedError` — 409 Conflict czy 422 Unprocessable Entity?
