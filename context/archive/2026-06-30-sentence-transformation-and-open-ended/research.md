---
date: 2026-06-30T09:50:00Z
researcher: AI Assistant
git_commit: da2f14068c51a20dc72869893cb6c706b53c68f3
branch: dev
repository: BET
topic: "Implement sentence_transformation and open_ended exercise types (S-07)"
tags: [research, codebase, exercises, s-07, sentence-transformation, open-ended]
status: complete
last_updated: 2026-06-30
last_updated_by: AI Assistant
---

# Badanie: S-07 — sentence_transformation i open_ended

**Data**: 2026-06-30
**Badacz**: AI Assistant
**Git Commit**: `da2f14068c51a20dc72869893cb6c706b53c68f3`
**Gałąź**: `dev`
**Repozytorium**: BET

## Pytanie badawcze

Jak wdrożyć ćwiczenia typu `sentence_transformation` i `open_ended` w istniejącym silniku ćwiczeń BET, korzystając z wzorców ustanowionych w S-06?

## Podsumowanie

S-07 można zaimplementować przyrostowo, rozszerzając pattern z S-06:

- **Admin**: rozszerzyć `ExerciseForm.tsx` o dwa nowe typy, usunąć guardy 400 w API admina, dodać payload `original` dla `sentence_transformation`.
- **Student**: dodać dwa nowe komponenty (`SentenceTransformationExercise`, `OpenEndedExercise`) i przypadki w `LessonInteractive.tsx`.
- **Weryfikacja**: `verify.ts` już obsługuje `sentence_transformation` przez domyślną gałąź porównania stringów; `open_ended` zwraca zawsze `{ correct: false }`, więc nie powinien wywoływać `onCorrect`.
- **Completion**: `closedExerciseCount = exercises.filter(e => e.type !== "open_ended")` już działa poprawnie — `sentence_transformation` blokuje, `open_ended` nie.
- **Seed**: `lesson_2_2` w `supabase/seed.sql` już zawiera oba typy; payload `sentence_transformation` powinien zostać uwzględniony w schemacie.

## Szczegółowe ustalenia

### Wymagania z PRD i roadmapy

- **FR-020**: Student może wykonywać ćwiczenia przerabiania zdań (`sentence_transformation`). `prd.md:103`
- **FR-021**: Student może odpowiadać na otwarte pytania po angielsku (`open_ended`). `prd.md:104`
- **FR-024**: Weryfikacja deterministyczna wg listy dopuszczalnych wariantów. Dla transformacji zdań akceptowalnych jest wiele wariantów. `prd.md:109-111`
- **FR-025**: Otwarte pytania wyświetlają wzorcową odpowiedź do samodzielnej oceny i **nie blokują** ukończenia lekcji. `prd.md:112-114`
- **Business Logic**: `open_ended` nie wchodzi w warunek zaliczenia; `sentence_transformation` jest ćwiczeniem zamkniętym i wchodzi. `prd.md:124-128`
- **Roadmap S-07**: `sentence-transformation-and-open-ended`, wymagania wstępne F-01, S-01, S-02 — wszystkie `done`. `roadmap.md:157-167`

### Stan obecny

- DB enum zawiera oba typy: `supabase/migrations/20260625184555_init.sql:34-41`
- `LessonInteractive.tsx:96-102` wyświetla placeholder dla obu typów.
- `ExerciseForm.tsx:3` obsługuje tylko 4 typy; API admina (`index.ts:54-56`, `[id].ts:61-63`) odrzuca S-07 z 400.
- `verify.ts:126-134` zwraca `{ correct: false }` dla `open_ended`; domyślna gałąź (`verify.ts:136-142`) obsługuje `sentence_transformation` przez porównanie normalizowanego stringa z listą kluczy.
- `lessons/[id].astro:57` liczy `closedExerciseCount` jako `type !== "open_ended"` — `sentence_transformation` już się liczy.
- `lessons/[id].astro:72-82` pobiera `correctAnswers` tylko dla zamkniętych typów; `open_ended` jest automatycznie wykluczony.
- Seed `supabase/seed.sql:209-251` zawiera `sentence_transformation` i `open_ended` w `lesson_2_2`.

## Odniesienia do kodu

- `src/components/admin/ExerciseForm.tsx:3` — aktualna unia typów (MC/FIB/T-F/Matching).
- `src/components/admin/ExerciseForm.tsx:62-98` — walidacja formularza per typ.
- `src/components/admin/ExerciseForm.tsx:119-128` — konstrukcja `keys` przed wysyłką.
- `src/pages/api/admin/exercises/index.ts:54-56` — guard odrzucający S-07.
- `src/pages/api/admin/exercises/index.ts:59-117` — walidacja payloadu/kluczy per typ.
- `src/pages/admin/exercises/[id]/edit.astro:50` — whitelist `editableTypes`.
- `src/components/lesson/LessonInteractive.tsx:68-103` — dispatcher ćwiczeń.
- `src/components/lesson/MultipleChoiceExercise.tsx:1-104` — wzorzec komponentu studenta.
- `src/pages/api/exercises/verify.ts:126-142` — gałęzie `open_ended` i domyślna.
- `src/pages/lessons/[id].astro:57-82` — liczenie zamkniętych i pobieranie odpowiedzi.
- `src/lib/exercise-schemas.ts:48-54` — schematy payloadów dla S-07 (obecnie pusty obiekt).
- `supabase/seed.sql:209-251` — ćwiczenia S-07 w seedzie.

## Wnioski architektoniczne

1. **Pattern komponentu studenta**: wszystkie renderery mają ten sam kontrakt (`exercise`, `onCorrect`, `disabled`, `initialCorrectAnswer`) i ten sam flow stanowy (`selected/answer`, `feedback`, `locked`, `isDisabled`). S-07 powinien go dokładnie powtórzyć.
2. **Klucze jako źródło prawdy**: `exercise_keys` przechowuje dopuszczalne warianty. Dla `sentence_transformation` każdy wariant to osobny wiersz. Dla `open_ended` pierwszy klucz jest wzorcem z `key_metadata.is_reference_only = true`.
3. **Payload JSONB**: `sentence_transformation` powinien przechowywać oryginalne zdanie w `payload.original` (zgodnie z seedem). `open_ended` zostaje z pustym payloadem.
4. **Zod v4 record schema**: wszelkie `z.record()` w admin API wymagają dwóch argumentów (`z.record(z.string(), z.unknown())`) — lekcja z `context/foundation/lessons.md:5-10`.

## Kontekst historyczny

- `context/archive/2026-06-29-closed-exercises-fill-match-truefalse/plan.md` — S-06 celowo zostawił S-07 jako placeholder; kluczowe decyzje (payload `{}`, klucze jako lista wariantów, `open_ended` reference_only) zostały już przewidziane.
- `context/archive/2026-06-26-admin-content-creation/plan.md` — wzorzec formularza admina z dynamicznymi polami (options, pairs).

## Otwarte pytania

1. Czy `sentence_transformation` powinien wymagać przynajmniej jednego wariantu klucza, czy dopuszczać pustą listę (wtedy verify zawsze zwraca błąd)?
2. Czy `open_ended` powinien być oznaczany jako "ukończony" w UI mimo braku weryfikacji, czy pozostać neutralnym samoocenowym blokiem?
3. Czy seed ma pozostać z payloadem `{"original": "..."}` dla `sentence_transformation`, czy przenieść oryginał do promptu i uprościć payload?
