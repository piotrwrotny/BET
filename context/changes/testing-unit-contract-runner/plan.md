# Plan wdrożenia: Bootstrap unit and contract runner for exercise verification

## Przegląd

Wdrożenie pierwszej fazy `context/foundation/test-plan.md`: zainstalowanie runnera testów jednostkowych/kontraktowych (Vitest), wyodrębnienie czystej logiki weryfikacji ćwiczeń z `src/pages/api/exercises/verify.ts` do `src/lib/verify-exercise.ts`, oraz napisanie testów jednostkowych i kontraktowych dla ryzyk #1, #2 i #5.

## Analiza stanu obecnego

- Projekt ma tylko testy E2E Playwright (`tests/e2e/`, 6 speców + `tests/seed.spec.ts`).
- Brak runnera testów jednostkowych/integracyjnych — `package.json` nie definiuje skryptów `test` / `test:unit`.
- Logika weryfikacji ćwiczeń znajduje się w jednym endpoincie `src/pages/api/exercises/verify.ts`.
- Funkcje nadające się do testów jednostkowych są inline: normalizacja odpowiedzi, porównanie mapy matchingu, dispatch po typie ćwiczenia.
- `parseMatchingKey` w `src/lib/exercise-schemas.ts` jest już czystą funkcją, ale nie ma dla niej testów.
- E2E pokrywa happy path, ale nie pokrywa granic normalizacji, wielowariantowych kluczy, kluczy `is_reference_only` ani błędnych map matchingu.

## Pożądany stan końcowy

- Zainstalowany i skonfigurowany Vitest z dedykowanym skryptem `test:unit`.
- Czysta logika weryfikacji wyodrębniona do `src/lib/verify-exercise.ts` i importowana przez `src/pages/api/exercises/verify.ts`.
- `src/lib/verify-exercise.test.ts` z testami jednostkowymi pokrywającymi ryzyka #1, #2 i #5.
- `src/lib/verify-contract.test.ts` z testami kontraktowymi round-trip payload → keys → verify.
- Wszystkie testy przechodzą; `npm run typecheck` i `npm run lint` pozostają zielone; E2E nie regresuje.

### Kluczowe odkrycia:

- `verify.ts` dzieli odpowiedzi na trzy gałęzie: `matching`, `open_ended`, oraz pozostałe typy zamknięte (`multiple_choice`, `fill_in_blank`, `true_false`, `sentence_transformation`).
- Dla typów zamkniętych normalizacja to tylko `answer.trim().toLowerCase()` (`verify.ts:137`).
- Dla `matching` używany jest `parseMatchingKey` (zarówno dla odpowiedzi studenta, jak i klucza), a porównanie opiera się na identycznych zbiorach kluczy i wartościach (`verify.ts:60-124`).
- Klucze `key_metadata.is_reference_only = true` są pomijane przy ocenie, co jest krytyczne dla `open_ended` (`verify.ts:76-77`, `141`).
- `open_ended` zawsze zwraca `{ correct: false }` (`verify.ts:126-132`).

## Czego NIE robimy

- Nie zmieniamy zachowania weryfikacji poza wymaganym przez refaktoryzację (zachowanie endpointu musi pozostać identyczne).
- Nie dodajemy nowych typów ćwiczeń ani nowej logiki biznesowej.
- Nie testujemy warstwy UI, RLS Supabase ani autoryzacji w tej fazie (ryzyko #4 — dostęp admin/student) — to zadanie Fazy 2 test-planu.
- Nie konfigurujemy CI/GitHub Actions w tej fazie — jedynie lokalne skrypty.

## Podejście do implementacji

1. Zainstalować Vitest i dodać skrypty bez wpływu na Playwright.
2. Wyodrębnić czyste funkcje z `verify.ts` do `src/lib/verify-exercise.ts`, zachowując niezmienny kontrakt endpointu.
3. Napisać testy jednostkowe dla każdej wyodrębnionej funkcji, skupiając się na granicach i trybach awarii.
4. Napisać testy kontraktowe round-trip: dla każdego typu zamkniętego zbudować payload + keys tak, jak robi API admina, i zweryfikować wynik.
5. Uruchomić pełną weryfikację (unit, typecheck, lint, E2E) i zaktualizować cookbook w `context/foundation/test-plan.md`.

## Krytyczne szczegóły implementacji

- **Sekwencjonowanie stanu**: faza 2 (wyodrębnienie logiki) musi zachować identyczne zachowanie endpointu. Przed refaktoryzacją warto uruchomić E2E jako baseline, aby wykryć ewentualną regresję.
- **Kontrakt `verifyExercise`**: funkcja przyjmuje `(type: ExerciseType, answer: string, keys: { key_text: string; key_metadata: unknown }[])` i zwraca `boolean`. Nie powinna wiedzieć nic o HTTP ani Supabase.
- **Nieznany typ ćwiczenia**: obecnie `verify.ts` przechodzi do gałęzi stringowej. Nowa funkcja dispatch powinna dla nieznanego typu zwrócić `false`, aby zapobiec fałszywym pozytywom. Jest to świadoma korekta zachowania brzegowego.

## Faza 1: Instalacja i konfiguracja Vitest

### Przegląd

Dodać runner testów jednostkowych, skonfigurować go tak, by nie kolidował z Playwright, i dodać wygodne skrypty npm.

### Wymagane zmiany:

#### 1.1 Zależności dev

**Plik**: `package.json`

**Cel**: Zainstalować Vitest oraz opcjonalnie coverage.

**Kontrakt**: Dodaj do `devDependencies`: `vitest`, `@vitest/coverage-v8`.

#### 1.2 Skrypty testowe

**Plik**: `package.json`

**Cel**: Umożliwić uruchamianie testów jednostkowych bez Playwright.

**Kontrakt**: Dodaj skrypty:
- `"test": "vitest run"`
- `"test:unit": "vitest run"`
- `"test:coverage": "vitest run --coverage"`
- `"test:watch": "vitest"`

#### 1.3 Konfiguracja Vitest

**Plik**: `vitest.config.ts`

**Cel**: Skonfigurować Vitest tak, by szukał testów w `src/**/*.test.ts` i ignorował Playwright.

**Kontrakt**:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    globals: false,
    environment: "node",
  },
});
```

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- `npm install` przechodzi bez konfliktów.
- `npm run test:unit` uruchamia Vitest i kończy się pomyślnie z 0 testów (brak testów jeszcze).
- `npm run typecheck` przechodzi.
- `npm run lint` przechodzi dla nowych plików.

#### Weryfikacja ręczna:

- `npm run test:watch` reaguje na zmiany plików `src/**/*.test.ts`.
- Playwright pozostaje niezależny: `npx playwright test --list` nadal widzi specy E2E.

## Faza 2: Wyodrębnienie logiki weryfikacji

### Przegląd

Przenieść czyste funkcje z `src/pages/api/exercises/verify.ts` do `src/lib/verify-exercise.ts`, zachowując identyczne zachowanie endpointu.

### Wymagane zmiany:

#### 2.1 Nowy moduł `src/lib/verify-exercise.ts`

**Plik**: `src/lib/verify-exercise.ts`

**Cel**: Umieścić logikę weryfikacji w testowalnej, czystej funkcji.

**Kontrakt**:
- Eksportuj `normalizeAnswer(answer: string): string` — `trim().toLowerCase()`.
- Eksportuj `compareMatchingMaps(studentMap: Record<string, string>, correctMap: Record<string, string>): boolean` — identyczne zbiory kluczy i wartości.
- Eksportuj `verifyClosedAnswer(answer: string, keys: ExerciseKey[]): boolean`.
- Eksportuj `verifyMatchingAnswer(answer: string, keys: ExerciseKey[]): boolean`.
- Eksportuj `verifyExercise(type: ExerciseType | string, answer: string, keys: ExerciseKey[]): boolean` — dispatch. Dla nieznanego typu zwraca `false`.

Gdzie `ExerciseKey = { key_text: string; key_metadata?: unknown }`.

#### 2.2 Refaktoryzacja `src/pages/api/exercises/verify.ts`

**Plik**: `src/pages/api/exercises/verify.ts`

**Cel**: Zachować obsługę HTTP/auth/DB, ale delegować decyzję do `verifyExercise`.

**Kontrakt**: Po pobraniu `exercise.type` oraz `keys` wywołaj `verifyExercise(exerciseType, answer, keys)` i zwróć `{ correct }`.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- `npm run typecheck` przechodzi.
- `npm run lint` przechodzi.
- `npm run test:unit` (jeszcze bez testów) nie zgłasza błędów.

#### Weryfikacja ręczna:

- E2E `tests/e2e/closed-exercises.spec.ts` i `tests/e2e/sentence-transformation-and-open-ended.spec.ts` przechodzą — potwierdzenie braku regresji.

## Faza 3: Testy jednostkowe logiki weryfikacji

### Przegląd

Pokryć testami jednostkowymi funkcje z `src/lib/verify-exercise.ts`, skupiając się na granicach ryzyk #1, #2 i #5.

### Wymagane zmiany:

#### 3.1 Testy jednostkowe

**Plik**: `src/lib/verify-exercise.test.ts`

**Cel**: Udowodnić poprawność i odporność logiki weryfikacji.

**Kontrakt**:
- Testy `normalizeAnswer`: spacje, wielkość liter, interpunkcja, pusty string.
- Testy `verifyClosedAnswer`: poprawna odpowiedź, błędna odpowiedź, wielowariantowe klucze (sentence_transformation), pominięcie `is_reference_only`, case-insensitive matching, trim.
- Testy `verifyMatchingAnswer`: poprawna mapa, dodatkowy klucz, brakujący klucz, zła wartość, niepoprawny JSON, wszystkie klucze `is_reference_only`.
- Testy `verifyExercise`: dispatch po typie, `open_ended` zawsze false, nieznany typ → false.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- `npm run test:unit` przechodzi z co najmniej 20 asercjami.
- Coverage dla `src/lib/verify-exercise.ts` wynosi 100%.
- `npm run typecheck` i `npm run lint` przechodzą.

#### Weryfikacja ręczna:

- Przegląd testów pokazuje, że każdy test ma niezależną wyrocznię (oczekiwana wartość nie jest kopią implementacji).

## Faza 4: Testy kontraktowe round-trip

### Przegląd

Sprawdzić, że payloady i klucze tworzone przez API admina są poprawnie interpretowane przez logikę weryfikacji.

### Wymagane zmiany:

#### 4.1 Testy kontraktowe

**Plik**: `src/lib/verify-contract.test.ts`

**Cel**: Udowodnić spójność między formatem danych admina a logiką verify.

**Kontrakt**:
- Dla `fill_in_blank`: payload `{}`, keys `["went", "travelled"]` — oba poprawne, błędna odpowiedź odrzucona.
- Dla `true_false`: payload `{}`, keys `["true"]` — poprawna i błędna odpowiedź.
- Dla `multiple_choice`: payload `{ options: ["A", "B"] }`, keys `["B"]` — poprawna i błędna odpowiedź. (Kontrakt verify nie patrzy na payload, ale test dokumentuje intencję.)
- Dla `sentence_transformation`: payload `{ original: "..." }`, keys `["She has too little money.", "She lacks enough money."]` — oba warianty poprawne.
- Dla `matching`: payload `{ pairs: [...] }`, keys `["{\"0\":\"1\",\"1\":\"0\"}"]` — poprawna i błędna mapa.
- Dla `open_ended`: payload `{}`, keys z `key_metadata: { is_reference_only: true }` — zawsze `false`.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- `npm run test:unit` przechodzi; kontraktowe testy są częścią tego samego zestawu.
- `npm run typecheck` i `npm run lint` przechodzą.

#### Weryfikacja ręczna:

- Testy round-trip odzwierciedlają dane, jakie API admina zapisuje do DB.

## Faza 5: Stabilizacja i aktualizacja test-plan.md

### Przegląd

Uruchomić pełną weryfikację i zaktualizować cookbook w `context/foundation/test-plan.md` wzorcami dostarczonymi przez tę fazę.

### Wymagane zmiany:

#### 5.1 Pełna weryfikacja

**Plik**: różne

**Cel**: Upewnić się, że nowe testy nie psują istniejących procesów.

**Kontrakt**:
- `npm run typecheck` — 0 błędów.
- `npm run lint` — 0 błędów (ewentualnie tylko pre-existing warnings).
- `npm run test:unit` — wszystkie zielone.
- `npx playwright test tests/e2e/` — pełny zestaw E2E zielony.

#### 5.2 Aktualizacja cookbook

**Plik**: `context/foundation/test-plan.md` §6

**Cel**: Zapisać wzorce testowe dla przyszłych zespołów.

**Kontrakt**: Wypełnić podsekcje:
- `6.1 Adding a unit test`
- `6.2 Adding an integration / API contract test`
- `6.6 Per-rollout-phase notes`

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Wszystkie powyższe polecenia przechodzą.

#### Weryfikacja ręczna:

- `context/foundation/test-plan.md` §6 zawiera praktyczne wzorce dla nowych testów.

## Strategia testowania

### Testy jednostkowe:

- Normalizacja odpowiedzi (granice: spacje, wielkość liter, interpunkcja).
- Wielowariantowe klucze dla `sentence_transformation`.
- Pomijanie kluczy `is_reference_only`.
- Porównanie map matchingu (dodatkowy/brakujący klucz, zła wartość).
- Zachowanie dispatch (`open_ended` false, nieznany typ false).

### Testy kontraktowe:

- Round-trip payload + keys → verify dla każdego z 6 typów ćwiczeń.

### Kroki testowania ręcznego:

1. Sprawdzić, czy `npm run test:watch` reaguje na zmiany w `src/lib/verify-exercise.ts`.
2. Sprawdzić, czy E2E `closed-exercises` i `sentence-transformation-and-open-ended` przechodzą po refaktoryzacji.
3. Przeglądnąć testy pod kątem niezależnych wyroczni.

## Uwagi dotyczące wydajności

- Testy jednostkowe są czyste funkcje — czas wykonania < 1 s.
- Vitest HMR nie wpływa na czas buildu produkcyjnego.

## Uwagi dotyczące migracji

- Brak migracji danych.
- Refaktoryzacja `verify.ts` to tylko przeniesienie logiki; kontrakt endpointu pozostaje niezmieniony.

## Referencje

- Badania: `context/changes/testing-unit-contract-runner/research.md`
- Plan testów: `context/foundation/test-plan.md`
- Kod źródłowy: `src/pages/api/exercises/verify.ts`, `src/lib/exercise-schemas.ts`, `src/pages/api/admin/exercises/index.ts`, `src/pages/api/admin/exercises/[id].ts`

## Postęp

> Konwencja: `- [ ]` oczekujące, `- [x]` wykonane. Dodaj ` — <commit sha>`, gdy krok zostanie zrealizowany. Nie zmieniaj nazw tytułów kroków.

### Faza 1: Instalacja i konfiguracja Vitest

#### Automatyczne

- [ ] 1.1 Zainstalować `vitest` i `@vitest/coverage-v8`
- [ ] 1.2 Dodać skrypty `test`, `test:unit`, `test:coverage`, `test:watch`
- [ ] 1.3 Utworzyć `vitest.config.ts`

#### Ręczne

- [ ] 1.4 Zweryfikować, że Playwright pozostaje niezależny

### Faza 2: Wyodrębnienie logiki weryfikacji

#### Automatyczne

- [ ] 2.1 Utworzyć `src/lib/verify-exercise.ts` z czystymi funkcjami
- [ ] 2.2 Zrefaktoryzować `src/pages/api/exercises/verify.ts` do użycia `verifyExercise`

#### Ręczne

- [ ] 2.3 Potwierdzić brak regresji w E2E closed-exercises i sentence-transformation

### Faza 3: Testy jednostkowe logiki weryfikacji

#### Automatyczne

- [ ] 3.1 Utworzyć `src/lib/verify-exercise.test.ts` z testami normalizacji
- [ ] 3.2 Dodać testy wielowariantowych kluczy i `is_reference_only`
- [ ] 3.3 Dodać testy mapy matchingu i dispatch
- [ ] 3.4 Osiągnąć 100% coverage `src/lib/verify-exercise.ts`

#### Ręczne

- [ ] 3.5 Przejrzeć testy pod kątem niezależnych wyroczni

### Faza 4: Testy kontraktowe round-trip

#### Automatyczne

- [ ] 4.1 Utworzyć `src/lib/verify-contract.test.ts` dla wszystkich 6 typów
- [ ] 4.2 Pokryć round-trip payload → keys → verify

#### Ręczne

- [ ] 4.3 Upewnić się, że dane testowe odzwierciedlają format API admina

### Faza 5: Stabilizacja i aktualizacja test-plan.md

#### Automatyczne

- [ ] 5.1 Uruchomić `npm run typecheck`, `npm run lint`, `npm run test:unit`, E2E

#### Ręczne

- [ ] 5.2 Zaktualizować `context/foundation/test-plan.md` §6 cookbook
