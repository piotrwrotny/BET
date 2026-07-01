---
date: 2026-06-30T11:50:05Z
researcher: AI coding assistant
git_commit: 0986a10
branch: dev
repository: BET
topic: Ground exercise verification surface for unit/contract test rollout Phase 1
tags: [research, codebase, exercise-verification, testing]
status: complete
last_updated: 2026-06-30
last_updated_by: AI coding assistant
---

# Badanie: Powierzchnia weryfikacji ćwiczeń dla testów jednostkowych/kontraktowych

**Data**: 2026-06-30T11:50:05Z
**Badacz**: AI coding assistant
**Git Commit**: 0986a10
**Gałąź**: dev
**Repozytorium**: BET

## Pytanie badawcze

Zgruntować powierzchnię weryfikacji ćwiczeń (`verify.ts`, schemat kluczy, normalizację odpowiedzi) oraz istniejącą bazę testową, aby zaplanować najtańsze testy jednostkowe/kontraktowe dla ryzyk:
- #1 — weryfikacja akceptuje błędną odpowiedź lub odrzuca poprawny wariant,
- #2 — refaktoryzacja schematu kluczy psuje dopasowanie wielowariantowe,
- #5 — normalizacja odpowiedzi daje fałszywe pozytywy/negatywy.

## Podsumowanie

Cała logika weryfikacji ćwiczeń zamkniętych znajduje się w jednym endpoincie `src/pages/api/exercises/verify.ts`. Nie ma dziś żadnych testów jednostkowych ani kontraktowych — projekt posiada tylko 6 speców Playwright E2E. Logika weryfikacji jest na tyle izolowana (normalizacja tekstu, dopasowanie do listy kluczy, parsowanie mapy matchingu), że większość ryzyk #1/#2/#5 można zabezpieczyć tańszą warstwą unit/kontrakt niż E2E. Największa luka: brak testów dla granic normalizacji, wariantów wielokrotnych, kluczy `is_reference_only` oraz map matchingu.

## Szczegółowe ustalenia

### 1. Endpoint `verify.ts` — centralna logika weryfikacji

- **Lokalizacja**: `src/pages/api/exercises/verify.ts`
- **Kontrakt wejścia**: `{ exercise_id: UUID, answer: string }` (`verify.ts:6-9`).
- **Autoryzacja**: tylko sprawdzenie zalogowanego użytkownika; szczegółowa kontrola dostępu do ćwiczenia realizowana przez RLS po stronie Supabase (`verify.ts:28-34`).
- **Pobranie kluczy**: `exercise_keys` z kolumnami `key_text`, `key_metadata` (`verify.ts:36-44`).

#### Działanie per typ ćwiczenia

**`open_ended`** (`verify.ts:126-132`)
- Zawsze zwraca `{ correct: false }`.
- Klucz wzorcowy (`key_metadata.is_reference_only = true`) jest pobierany, ale nigdy nie uczestniczy w ocenie.

**`matching`** (`verify.ts:60-124`)
- Odpowiedź studenta jest parsowana przez `parseMatchingKey` do `Record<string,string>`.
- Wybierany jest **pierwszy** klucz, który nie ma `is_reference_only = true` (`verify.ts:73-78`).
- Porównanie: identyczne zbiory kluczy i identyczne wartości dla każdego lewego indeksu (`verify.ts:106-115`).
- Nie ma normalizacji poza `String()` w `parseMatchingKey`.

**Pozostałe typy zamknięte** (`multiple_choice`, `fill_in_blank`, `true_false`, `sentence_transformation`) (`verify.ts:135-142`)
- `normalizedAnswer = answer.trim().toLowerCase()`.
- `correct = keys.some(...)` po wszystkich kluczach, pomijając `is_reference_only = true`.
- Dopasowanie dokładne: `key_text.trim().toLowerCase() === normalizedAnswer`.

#### Ryzyka wykryte w `verify.ts`

- **Nieznany typ ćwiczenia** (`verify.ts:58`) przechodzi do gałęzi porównania stringów. Jeśli typ zostanie błędnie zapisany lub brakuje go w enumie, odpowiedź może być błędnie uznana za poprawną.
- **Wszystkie klucze `is_reference_only = true`** dla typów zamkniętych zawsze dają `correct = false`.
- **Brak normalizacji interpunkcji / diakrytyków / artykułów** — tylko `trim().toLowerCase()`.
- **Redundantne sprawdzenie długości** w matchingu (`verify.ts:106-112`) przed `every()`.

### 2. `exercise-schemas.ts` — payloady i parser matchingu

- **Lokalizacja**: `src/lib/exercise-schemas.ts`
- `parseMatchingKey` (`exercise-schemas.ts:65-77`) jest jedyną funkcją czystą w tej warstwie, idealną do testów jednostkowych.
- Zachowania istotne dla ryzyka #2:
  - `JSON.parse` przechowuje ostatnią wartość przy duplikatach kluczy.
  - Wartości niebędące stringiem są rzutowane przez `String(right)` (np. `1` → `"1"`, `true` → `"true"`, `null` → `"null"`).
  - Rzuca, gdy root jest `null`, tablicą lub nie-obiektem.
- `ExercisePayloadSchema` to zodowa discriminated union po `type` (`exercise-schemas.ts:39-58`). Zmiana payloadu bez aktualizacji schematu lub `verify.ts` może zerwać weryfikację.

### 3. API admina — tworzenie i aktualizacja kluczy

- **Lokalizacje**: `src/pages/api/admin/exercises/index.ts`, `src/pages/api/admin/exercises/[id].ts`
- Schemat wejściowy (`CreateExerciseSchema` / `UpdateExerciseSchema`) akceptuje `keys: string[]` i `payload: Record<string, unknown>`.
- Walidacja typowa odbywa się tylko app-side (Zod); DB przechowuje `payload` jako `jsonb`.
- `sentence_transformation`: wymagany `payload.original` (`admin/exercises/index.ts:118-126` i `[id].ts:103-111`).
- `open_ended`: wymagany pusty payload i dokładnie jeden klucz; klucz zapisywany z `key_metadata = { is_reference_only: true }` (`admin/exercises/index.ts:128-136`, `[id].ts:113-119`, `[id].ts:164-170`).
- **Ryzyko**: aktualizacja `[id].ts` wykonuje "replace-all" kluczy: usuwa stare, wstawia nowe, przy błędzie wstawiania przywraca stare (`[id].ts:140-177`). Brak testów kontraktowych tej operacji.

### 4. Schemat bazy danych

- **Lokalizacja**: `supabase/migrations/20260625184555_init.ts:109-131`
- `public.exercises`: `lesson_id`, `type`, `prompt`, `payload jsonb`, `ord`.
- `public.exercise_keys`: `exercise_id`, `key_text text not null`, `key_metadata jsonb`, `ord`. Unikalność po `(exercise_id, ord)`.
- Typ `exercise_type` to enum z 6 wartościami (`supabase/migrations/20260625184555_init.ts:34-40`).
- DB **nie egzekwuje** kształtu payloadu ani znaczenia `key_metadata`.

### 5. Istniejąca baza testowa

- **Tylko Playwright**: `playwright.config.ts` (`testDir: './tests'`).
- **Brak runnera unit/integracyjnego**: w `package.json` nie ma skryptów `test`, `test:e2e`, `test:unit`; brak `vitest.config.*` / `jest.config.*`.
- **Brak workflow CI**: nie ma `.github/workflows/`.
- **E2E pokrywa głównie happy path**: fill_in_blank, true_false, matching, sentence_transformation, open_ended, completion gating (`tests/e2e/closed-exercises.spec.ts`, `tests/e2e/sentence-transformation-and-open-ended.spec.ts`).
- **Luki E2E**: granice normalizacji, wielowariantowe klucze, błędne odpowiedzi dla MC/TF/FIB, klucze `is_reference_only`, parsowanie matchingu.

## Odniesienia do kodu

- `src/pages/api/exercises/verify.ts:6-9` — kontrakt wejścia `/api/exercises/verify`
- `src/pages/api/exercises/verify.ts:28-34` — autoryzacja użytkownika
- `src/pages/api/exercises/verify.ts:60-124` — weryfikacja `matching`
- `src/pages/api/exercises/verify.ts:126-132` — `open_ended` zawsze `false`
- `src/pages/api/exercises/verify.ts:135-142` — weryfikacja pozostałych typów zamkniętych
- `src/lib/exercise-schemas.ts:39-58` — discriminated union payloadów
- `src/lib/exercise-schemas.ts:65-77` — `parseMatchingKey`
- `src/pages/api/admin/exercises/index.ts:56-136` — walidacja tworzenia ćwiczenia i zapis kluczy
- `src/pages/api/admin/exercises/[id].ts:23-177` — aktualizacja ćwiczenia i replace-all kluczy
- `supabase/migrations/20260625184555_init.ts:109-131` — schemat `exercises` i `exercise_keys`
- `playwright.config.ts` — obecna konfiguracja E2E
- `package.json` — brak skryptów testowych poza lint/typecheck

## Wnioski architektoniczne

1. **Logika weryfikacji jest monolityczna w jednym endpoincie**, ale zawiera czyste podfunkcje (`parseMatchingKey`, normalizacja, porównanie mapy matchingu), które nadają się do izolowanych testów jednostkowych.
2. **Kontrakt pomiędzy API admina a `verify.ts` jest niejawny**: `key_text` oznacza co innego dla `matching` (mapa JSON) i innych typów (tekst odpowiedzi). Zmiana w jednym miejscu bez testów kontraktowych łatwo psuje drugie.
3. **DB nie strzeże spójności**: `payload` i `key_metadata` są `jsonb`, więc wszelkie gwarancje muszą pochodzić z kodu i testów.
4. **Najtańsza warstwa dla ryzyk #1/#2/#5 to unit + contract tests**: nie potrzebują przeglądarki ani bazy; wystarczy wyodrębnić czyste funkcje i testować kontrakty wejście/wyjście.

## Kontekst historyczny

- `context/archive/2026-06-29-closed-exercises-fill-match-truefalse/plan.md` — decyzja o deterministycznej weryfikacji i matchingu przez mapę JSON.
- `context/archive/2026-06-29-closed-exercises-fill-match-truefalse/research.md` — wcześniejsza analiza `verify.ts` i `exercise-schemas.ts`, zwraca uwagę na brak normalizacji.
- `context/archive/2026-06-30-sentence-transformation-and-open-ended/plan.md` — rozszerzenie o `sentence_transformation` (wielowariantowe klucze) i `open_ended` (`is_reference_only`).
- `context/archive/2026-06-30-sentence-transformation-and-open-ended/research.md` — weryfikacja schematu payloadów i zapisu kluczy wzorcowych.

## Powiązane badania

- `context/archive/2026-06-29-closed-exercises-fill-match-truefalse/research.md`
- `context/archive/2026-06-30-sentence-transformation-and-open-ended/research.md`

## Otwarte pytania

1. Czy w przyszłości planowana jest normalizacja interpunkcji / artykułów / diakrytyków? Obecna `trim().toLowerCase()` może być celowo minimalistyczna.
2. Czy `verify.ts` powinien odrzucać nieznany typ ćwiczenia z błędem zamiast przechodzić do porównania stringów?
3. Czy klucze `is_reference_only` mogą kiedykolwiek pojawić się przy typach innych niż `open_ended`? Obecna logika je pomija dla wszystkich zamkniętych typów.
