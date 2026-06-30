# Plan wdrożenia: S-07 — sentence_transformation i open_ended

## Przegląd

Wdrożenie ostatnich dwóch typów ćwiczeń z roadmapy MVP: `sentence_transformation` (zamknięte, wielowariantowe, blokuje ukończenie lekcji) oraz `open_ended` (otwarte, samoocena, nie blokuje ukończenia). Plan zakłada przyrostowe rozszerzenie wzorców ustanowionych w S-06 bez zmian w modelu bazy danych.

## Analiza stanu obecnego

- DB enum zawiera oba typy (`supabase/migrations/20260625184555_init.sql:34-41`).
- `verify.ts:128-142` już obsługuje oba typy: `open_ended` zawsze zwraca `{ correct: false }`, a domyślna gałąź porównuje odpowiedź z listą kluczy dla `sentence_transformation`.
- `lessons/[id].astro:57` liczy `closedExerciseCount = exercises.filter(e => e.type !== "open_ended")`, więc `sentence_transformation` już się liczy jako zamknięte, a `open_ended` nie blokuje.
- `ExerciseForm.tsx:3` obsługuje tylko 4 typy; API admina (`index.ts:54-56`, `[id].ts:61-63`) odrzuca S-07 z 400.
- `LessonInteractive.tsx:96-102` wyświetla placeholder dla obu typów.
- Seed `supabase/seed.sql:209-251` zawiera `sentence_transformation` z `payload.original`, ale `exercise-schemas.ts:48-54` deklaruje dla niego pusty obiekt.

## Pożądany stan końcowy

Admin może tworzyć i edytować ćwiczenia `sentence_transformation` (z oryginalnym zdaniem i listą dopuszczalnych wariantów) oraz `open_ended` (z wzorcową odpowiedzią). Student widzi dedykowane UI dla obu typów: transformację rozwiązuje przez wpisanie odpowiedzi i weryfikację, a pytanie otwarte pozwala najpierw samodzielnie odpowiedzieć, a potem odsłonić wzorzec. Ukończenie lekcji wymaga tylko rozwiązania ćwiczeń zamkniętych.

## Czego NIE robimy

- Nie dodajemy LLM do oceny `open_ended`.
- Nie zmieniamy modelu bazy danych ani enuma typów ćwiczeń.
- Nie rozszerzamy `open_ended` o ręczne zaznaczanie „ukończone" wpływające na completion.
- Nie modyfikujemy logiki chapter/lesson progress poza związanymi z S-07 komponentami.
- Nie zmieniamy istniejących testów S-04/S-06.

## Podejście do implementacji

Rozszerzamy pattern z S-06: jednolity kontrakt komponentów studenta, dynamiczne pola formularza admina, walidacja per typ w API, klucze jako źródło prawdy. Dla `open_ended` API dodaje `key_metadata.is_reference_only` przy zapisie, a strona lekcji przekazuje odpowiedź wzorcową do komponentu osobnym propem.

## Krytyczne szczegóły implementacji

- **Sekwencjonowanie stanu w `OpenEndedExercise`**: komponent nie wywołuje `onCorrect`, więc nigdy nie wpływa na `completedExercises` ani `closedExerciseCount`. Jest to kluczowe dla poprawnego działania gatingu lekcji.
- **Metadane klucza w API**: formularz admina wysyła `keys` jako zwykłą tablicę stringów. Endpointy `/api/admin/exercises/*` muszą dla `open_ended` zapisać jedyny klucz z `key_metadata = { is_reference_only: true }`, inaczej `verify.ts` i tryb review potraktują go jako poprawną odpowiedź.
- **Wzorzec odpowiedzi dla `open_ended`**: `lessons/[id].astro` musi pobrać klucze `is_reference_only` dla ćwiczeń `open_ended` zawsze — nie tylko w trybie review — ponieważ student powinien móc odsłonić wzorzec przed ukończeniem lekcji.

## Faza 1: Schemat danych i API admina

### Przegląd

Rozszerzenie walidacji payloadów i usunięcie guardów blokujących S-07 w API admina.

### Wymagane zmiany:

#### 1.1 Schematy payloadów

**Plik**: `src/lib/exercise-schemas.ts`

**Cel**: Dopasować schematy do seedu i nowego modelu danych: `sentence_transformation` przechowuje oryginalne zdanie w `payload.original`, `open_ended` pozostaje z pustym payloadem.

**Kontrakt**:
- `SentenceTransformationPayloadSchema = z.object({ original: z.string().min(1) })`
- `OpenEndedPayloadSchema = z.object({}).strict()`
- Aktualizacja `ExercisePayloadSchema` (discriminated union) o nowe warianty.

#### 1.2 API tworzenia ćwiczenia

**Plik**: `src/pages/api/admin/exercises/index.ts`

**Cel**: Usunąć guard odrzucający S-07 i dodać walidację specyficzną dla nowych typów.

**Kontrakt**:
- Usunąć blok `if (type === "sentence_transformation" || type === "open_ended")`.
- Dla `sentence_transformation`: walidacja `SentenceTransformationPayloadSchema`, wymagany co najmniej jeden klucz.
- Dla `open_ended`: walidacja `OpenEndedPayloadSchema`, wymagany dokładnie jeden klucz.
- Przy wstawianiu `exercise_keys` dla `open_ended` dodać `key_metadata: { is_reference_only: true }`.

#### 1.3 API aktualizacji ćwiczenia

**Plik**: `src/pages/api/admin/exercises/[id].ts`

**Cel**: To samo co w Fazie 1.2, ale dla endpointu aktualizacji.

**Kontrakt**:
- Usunąć guard.
- Dodać walidację `sentence_transformation` i `open_ended`.
- Przy zapisie kluczy dla `open_ended` dodać `key_metadata: { is_reference_only: true }`.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- `npm run typecheck` przechodzi.
- `npm run lint` przechodzi.
- Ręczny `curl` tworzy `sentence_transformation` i `open_ended` bez błędu 400.

#### Weryfikacja ręczna:

- Utworzone ćwiczenie `open_ended` ma w bazie `key_metadata = { is_reference_only: true }`.
- Utworzone ćwiczenie `sentence_transformation` ma `payload.original` i listę kluczy bez metadanych.

---

## Faza 2: Formularz admina

### Przegląd

Rozszerzenie `ExerciseForm.tsx` o obsługę nowych typów oraz aktualizacja strony edycji.

### Wymagane zmiany:

#### 2.1 Stan, typy i walidacja formularza

**Plik**: `src/components/admin/ExerciseForm.tsx`

**Cel**: Dodać obsługę stanu dla `sentence_transformation` (oryginał + dynamiczna lista wariantów) i `open_ended` (jedna wzorcowa odpowiedź), oraz odpowiednie reguły walidacji.

**Kontrakt**:
- Rozszerzenie lokalnego typu `ExerciseType` o `"sentence_transformation" | "open_ended"`.
- Nowe stany: `originalText`, `stAnswers`, `refAnswer`.
- `validate()` wymaga: dla `sentence_transformation` — prompt, oryginał, min. 1 wariant; dla `open_ended` — prompt i wzorzec.
- `handleSubmit`: payload = `{ original }` lub `{}`; keys = filtrowane `stAnswers` lub `[refAnswer]`.

#### 2.2 UI nowych typów

**Plik**: `src/components/admin/ExerciseForm.tsx`

**Cel**: Wyrenderować dedykowane pola dla nowych typów poniżej promptu.

**Kontrakt**:
- `sentence_transformation`: textarea "Oryginalne zdanie", lista pól "Dopuszczalne warianty" z przyciskiem "+ Dodaj wariant".
- `open_ended`: textarea "Wzorcowa odpowiedź".

#### 2.3 Strona edycji

**Plik**: `src/pages/admin/exercises/[id]/edit.astro`

**Cel**: Umożliwić edycję ćwiczeń S-07.

**Kontrakt**:
- `editableTypes` zawiera `"sentence_transformation"`, `"open_ended"`.
- `initialType` cast rozszerzony o nowe typy.
- Dla `sentence_transformation` wyciągnąć `payload.original` i przekazać jako `initialOriginal`.
- `initialKeys` przekazywane do formularza: dla `open_ended` to pojedynczy wzorzec, dla `sentence_transformation` lista wariantów.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- `npm run typecheck` przechodzi.
- `npm run lint` przechodzi.

#### Weryfikacja ręczna:

- Admin tworzy nowe ćwiczenie `sentence_transformation` z oryginałem i dwoma wariantami.
- Admin tworzy nowe ćwiczenie `open_ended` z wzorcem.
- Edycja obu typów wczytuje zapisane dane poprawnie.

---

## Faza 3: Komponenty studenta i strona lekcji

### Przegląd

Dodanie rendererów studenta i podłączenie ich do dispatcher'a oraz strony lekcji.

### Wymagane zmiany:

#### 3.1 Renderer transformacji zdania

**Plik**: `src/components/lesson/SentenceTransformationExercise.tsx`

**Cel**: Umożliwić studentowi wpisanie przekształconego zdania i zweryfikowanie go.

**Kontrakt**:
- Props: `{ exercise: { id, prompt, payload: { original } }; onCorrect; disabled?; initialCorrectAnswer? }`.
- UI: prompt, wyświetlenie `payload.original` (fallback do promptu, jeśli brak), textarea, przycisk "Sprawdź", feedback ✓/✗.
- Po poprawnej odpowiedzi: `locked = true`, `onCorrect(exercise.id)`.
- Normalizacja odpowiedzi weryfikowana po stronie serwera.

#### 3.2 Renderer pytania otwartego

**Plik**: `src/components/lesson/OpenEndedExercise.tsx`

**Cel**: Umożliwić studentowi samodzielną odpowiedź i odsłonięcie wzorca do samooceny.

**Kontrakt**:
- Props: `{ exercise: { id, prompt }; initialReferenceAnswer?; disabled? }`.
- UI: prompt, textarea na własną odpowiedź, przycisk "Pokaż wzorzec", po kliknięciu wyświetlenie odpowiedzi wzorcowej.
- **Nie wywołuje `onCorrect`** — nie wpływa na completion.

#### 3.3 Dispatcher ćwiczeń

**Plik**: `src/components/lesson/LessonInteractive.tsx`

**Cel**: Podłączyć nowe komponenty i przekazać odpowiedzi wzorcowe.

**Kontrakt**:
- Import `SentenceTransformationExercise` i `OpenEndedExercise`.
- Nowe `case` w `renderExercise`.
- Nowy prop opcjonalny `referenceAnswers?: Record<string, string>`.
- Dla `open_ended` przekazać `initialReferenceAnswer={referenceAnswers[ex.id]}`.

#### 3.4 Strona lekcji

**Plik**: `src/pages/lessons/[id].astro`

**Cel**: Pobrać odpowiedzi wzorcowe dla `open_ended` i przekazać je do `LessonInteractive`.

**Kontrakt**:
- Pobrać `exercise_keys` dla ćwiczeń `open_ended` zawsze (nie tylko w trybie review).
- Zbudować `referenceAnswers: Record<string, string>` z kluczy oznaczonych `is_reference_only`.
- Przekazać `referenceAnswers` jako prop do `LessonInteractive`.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- `npm run typecheck` przechodzi.
- `npm run lint` przechodzi.

#### Weryfikacja ręczna:

- Student wpisuje poprawny wariant transformacji i widzi ✓.
- Student wpisuje błędny wariant transformacji i widzi ✗.
- W `open_ended` student wpisuje odpowiedź, klika "Pokaż wzorzec" i widzi wzorcową odpowiedź.
- Przycisk "Przeczytano" aktywuje się po rozwiązaniu tylko `sentence_transformation`, bez konieczności interakcji z `open_ended`.

---

## Faza 4: Testy E2E i stabilizacja

### Przegląd

Dopisanie specu E2E pokrywającego pełny flow admin → student dla S-07 oraz uruchomienie pełnego zestawu testów.

### Wymagane zmiany:

#### 4.1 Nowy spec E2E

**Plik**: `tests/e2e/sentence-transformation-and-open-ended.spec.ts`

**Cel**: Zweryfikować tworzenie obu typów przez admina i rozwiązanie ich przez studenta.

**Kontrakt**:
- `test.describe.serial` (podobnie jak `admin-users.spec.ts`), unikalny suffix w nazwach.
- `beforeEach`: `npm run db:reset` (zgodnie z praktyką S-06) i logowanie admina.
- Tworzenie lekcji przez API admina (`/api/admin/lessons` itd.) wg wzorca z `closed-exercises.spec.ts`.
- Dodanie `sentence_transformation` i `open_ended` przez `/api/admin/exercises`.
- Logowanie studenta, nawigacja do lekcji, rozwiązanie transformacji, odsłonięcie wzorca w `open_ended`, kliknięcie "Przeczytano".
- `afterEach`: usunięcie lekcji przez API admina.

#### 4.2 Pełny zestaw E2E

**Cel**: Upewnić się, że S-07 nie psuje istniejących testów.

**Kontrakt**:
- `npx playwright test tests/e2e/` → wszystkie specy zielone na czystej bazie.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Nowy spec przechodzi.
- Pełny zestaw `tests/e2e/` przechodzi.
- `npm run typecheck` przechodzi.
- `npm run lint` przechodzi.

#### Weryfikacja ręczna:

- Lekcja `lesson_2_2` z seedu wyświetla oba typy poprawnie.
- `open_ended` w seedzie nie blokuje ukończenia lekcji.

---

## Strategia testowania

### Testy jednostkowe

Projekt nie posiada obecnie dedykowanej warstwy testów jednostkowych dla komponentów. Weryfikacja odbywa się przez E2E.

### Testy integracyjne / E2E

- Nowy spec `tests/e2e/sentence-transformation-and-open-ended.spec.ts` pokrywa:
  - Tworzenie obu typów przez admina.
  - Weryfikację poprawnego wariantu `sentence_transformation`.
  - Odrzucenie błędnego wariantu.
  - Odsłonięcie wzorca w `open_ended`.
  - Ukończenie lekcji bez interakcji z `open_ended`.
  - Cleanup po każdym teście.
- Pełny zestaw `tests/e2e/` uruchamiany przed zakończeniem planu.

### Kroki testowania ręcznego

1. Wejść do `/admin/exercises/new?lesson_id=<id>` i utworzyć `sentence_transformation`.
2. Sprawdzić, że oryginał i warianty zapisują się poprawnie.
3. Utworzyć `open_ended` i sprawdzić wzorcową odpowiedź w bazie.
4. Jako student otworzyć lekcję, rozwiązać transformację, odsłonić wzorzec w pytaniu otwartym.
5. Kliknąć "Przeczytano" i potwierdzić ukończenie.

## Uwagi dotyczące wydajności

Brak istotnych zmian wydajnościowych. Pobranie kluczy `open_ended` to jedno dodatkowe zapytanie `IN (...)` na stronie lekcji, ograniczone do ćwiczeń w jednej lekcji.

## Uwagi dotyczące migracji

Nie wymagana migracja bazy danych. Istniejące rekordy `sentence_transformation` z pustym `payload.original` będą obsługiwane przez fallback do promptu w komponencie studenta i formularzu admina.

## Referencje

- Badania: `context/changes/sentence-transformation-and-open-ended/research.md`
- PRD: `context/foundation/prd.md` (FR-020, FR-021, FR-024, FR-025, Business Logic)
- Roadmap: `context/foundation/roadmap.md` (S-07)
- Wzorzec S-06: `context/archive/2026-06-29-closed-exercises-fill-match-truefalse/plan.md`
- Kod: `src/components/admin/ExerciseForm.tsx:3`, `src/pages/api/admin/exercises/index.ts:54-56`, `src/pages/api/admin/exercises/[id].ts:61-63`, `src/components/lesson/LessonInteractive.tsx:68-103`, `src/pages/lessons/[id].astro:57-82`, `src/pages/api/exercises/verify.ts:128-142`

## Postęp

> Konwencja: `- [ ]` oczekujące, `- [x]` wykonane. Dodaj ` — <commit sha>`, gdy krok zostanie zrealizowany. Nie zmieniaj nazw tytułów kroków.

### Faza 1: Schemat danych i API admina

#### Automatyczne

- [x] 1.1 `src/lib/exercise-schemas.ts` rozszerzone o `SentenceTransformationPayloadSchema` i `OpenEndedPayloadSchema` — 0aac517
- [x] 1.2 `src/pages/api/admin/exercises/index.ts` usuwa guard i waliduje S-07 — 0aac517
- [x] 1.3 `src/pages/api/admin/exercises/[id].ts` usuwa guard i waliduje S-07 — 0aac517
- [x] 1.4 `npm run typecheck` i `npm run lint` przechodzą — 0aac517

#### Ręczne

- [x] 1.5 Ręczny `curl` tworzy `sentence_transformation` i `open_ended` — 0aac517
- [x] 1.6 `open_ended` zapisuje klucz z `is_reference_only: true` — 0aac517

### Faza 2: Formularz admina

#### Automatyczne

- [x] 2.1 `src/components/admin/ExerciseForm.tsx` obsługuje nowe typy
- [x] 2.2 `src/pages/admin/exercises/[id]/edit.astro` pozwala edytować S-07
- [x] 2.3 `npm run typecheck` i `npm run lint` przechodzą

#### Ręczne

- [x] 2.4 Admin tworzy `sentence_transformation` z oryginałem i wariantami
- [x] 2.5 Admin tworzy `open_ended` z wzorcem
- [x] 2.6 Edycja obu typów wczytuje dane poprawnie

### Faza 3: Komponenty studenta i strona lekcji

#### Automatyczne

- [ ] 3.1 `src/components/lesson/SentenceTransformationExercise.tsx` utworzony
- [ ] 3.2 `src/components/lesson/OpenEndedExercise.tsx` utworzony
- [ ] 3.3 `src/components/lesson/LessonInteractive.tsx` podłącza nowe komponenty i `referenceAnswers`
- [ ] 3.4 `src/pages/lessons/[id].astro` pobiera i przekazuje `referenceAnswers`
- [ ] 3.5 `npm run typecheck` i `npm run lint` przechodzą

#### Ręczne

- [ ] 3.6 Student rozwiązuje `sentence_transformation`
- [ ] 3.7 Student odsłania wzorzec w `open_ended`
- [ ] 3.8 Ukończenie lekcji nie wymaga interakcji z `open_ended`

### Faza 4: Testy E2E i stabilizacja

#### Automatyczne

- [ ] 4.1 `tests/e2e/sentence-transformation-and-open-ended.spec.ts` utworzony
- [ ] 4.2 Nowy spec przechodzi
- [ ] 4.3 Pełny zestaw `npx playwright test tests/e2e/` przechodzi
- [ ] 4.4 `npm run typecheck` i `npm run lint` przechodzą

#### Ręczne

- [ ] 4.5 Lekcja `lesson_2_2` z seedu renderuje oba typy poprawnie
- [ ] 4.6 `open_ended` w seedzie nie blokuje ukończenia lekcji
