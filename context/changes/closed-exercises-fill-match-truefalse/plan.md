# Plan wdrożenia S-06: Closed exercise types — fill-in-blank, matching, true/false

## Przegląd

Wdrażamy trzy brakujące typy ćwiczeń zamkniętych (fill-in-the-blank, matching, true/false) w całym cyklu życia: tworzenie i edycja w adminie, renderowanie dla studenta, weryfikację odpowiedzi oraz wpływ na ukończenie lekcji. Pozostawiamy `sentence_transformation` i `open_ended` jako placeholdery pod S-07.

## Analiza stanu obecnego

- Baza danych obsługuje sześć typów ćwiczeń, ale aplikacja zna tylko `multiple_choice`, `fill_in_blank` i `true_false` (`src/components/admin/ExerciseForm.tsx:3`; `src/pages/api/admin/exercises/index.ts:7`; `src/pages/api/admin/exercises/[id].ts:7`).
- `fill_in_blank` i `true_false` istnieją w adminie, lecz wysyłają pusty `payload = {}`. Weryfikacja działa przez zwykłe porównanie stringów (`src/pages/api/exercises/verify.ts:52-60`), więc oba typy już technicznie działają — brakuje tylko student renderera i poprawnego liczenia `closedExerciseCount`.
- `matching` nie ma schematu payloadu, edytora, renderera ani logiki weryfikacji.
- `LessonInteractive.tsx` wyświetla placeholder dla każdego typu poza MC (`src/components/lesson/LessonInteractive.tsx:76-83`).
- `lessons/[id].astro` liczy `closedExerciseCount` tylko po `multiple_choice` (`src/pages/lessons/[id].astro:59`), co pozwala na zaliczenie lekcji bez rozwiązania FIB/T-F/M.
- W trybie review `correctAnswers` pobierane są tylko dla MC (`src/pages/lessons/[id].astro:73-83`).
- Seed `supabase/seed.sql` zapisuje `lesson_2_1` jako `multiple_choice` z opcjami `True/False` zamiast natywnego typu `true_false`.

## Pożądany stan końcowy

Po zakończeniu planu:
- Admin może utworzyć i edytować ćwiczenia FIB, T/F i matching przez `ExerciseForm.tsx`.
- Student rozwiązuje FIB (jedna luka oznaczona `_____`), T/F (radio Prawda/Fałsz) i matching (dwie kolumny par) z tym samym kontraktem weryfikacji co MC.
- `verify.ts` obsługuje matching poprzez parsowanie JSON-owej mapy odpowiedzi i porównanie z kanoniczną mapą przechowywaną w `exercise_keys.key_text`.
- Liczba ćwiczeń zamkniętych obejmuje wszystkie typy oprócz `open_ended`, więc lekcja nie zalicza się bez rozwiązania każdego z nich.
- `sentence_transformation` i `open_ended` pozostają nieedytowalne/nierenderowalne z widocznym placeholderem.
- `lesson_2_1` w seedzie jest natywnie `true_false`.
- Istnieją testy E2E tworzące każdy typ i weryfikujące rozwiązanie + zaliczenie lekcji.

## Czego NIE robimy

- Nie wdrażamy renderera ani edytora dla `sentence_transformation` (S-07).
- Nie wdrażamy renderera ani edytora dla `open_ended` (S-07).
- Nie zmieniamy kontraktu API `verify.ts` na dyskryminowaną unię — `answer` pozostaje `z.string()`.
- Nie wspieramy wielu luk w jednym ćwiczeniu FIB; zakładamy jedną lukę na ćwiczenie.
- Nie zmieniamy modelu bazy danych — wykorzystujemy istniejący `payload jsonb` i `exercise_keys`.
- Nie dodajemy LLM ani ręcznej oceny dla odpowiedzi otwartych.

## Podejście do implementacji

Rozszerzamy istniejący silnik ćwiczeń przyrostowo:
1. **Typy i walidacja jako pierwsze** — dodajemy Zodowe schematy payloadów i aktualizujemy `ExerciseTypeEnum` w admin API, aby nowe typy były akceptowane end-to-end.
2. **Admin UI** — dopisujemy gałąź matching do `ExerciseForm.tsx` (edytor par z add/remove), zachowując obecny układ formularza dla MC/FIB/T-F.
3. **Student renderery** — dodajemy trzy komponenty według wzoru `MultipleChoiceExercise.tsx` i zamieniamy if-placeholder w `LessonInteractive.tsx` na mapę dispatcherów.
4. **Weryfikacja i review** — wzbogacamy `verify.ts` o gałąź matching, a `lessons/[id].astro` o poprawne liczenie ćwiczeń zamkniętych oraz pobieranie odpowiedzi wzorcowych dla nowych typów.
5. **Dane i testy** — poprawiamy seed i piszemy testy E2E Playwright.

Wszystkie decyzje danych (kształt payloadu, format klucza matchingu, forma odpowiedzi studenta) są ustalone w sekcji „Decyzje do zakodowania” zadania.

## Faza 1: Schema/types + admin API validation + ExerciseForm matching branch

### Przegląd

Ustalamy wspólny kontrakt typów i walidacji dla wszystkich zamkniętych typów ćwiczeń oraz dodajemy edycję matchingu w adminie.

### Wymagane zmiany:

#### 1.1. Wspólne typy i schematy payloadów

**Plik**: `src/lib/exercise-schemas.ts` (nowy)

**Cel**: Wydzielić dyskryminowaną unię payloadów i pomocnicze typy, aby komponenty admina, API i renderery studenta korzystały z jednego źródła prawdy.

**Kontrakt**:
```ts
export const ExerciseTypeEnum = z.enum([
  "multiple_choice",
  "fill_in_blank",
  "matching",
  "true_false",
  "sentence_transformation",
  "open_ended",
]);

export const MultipleChoicePayloadSchema = z.object({ options: z.array(z.string()) });
export const FillInBlankPayloadSchema = z.object({}); // lub z.object({}).strict()
export const TrueFalsePayloadSchema = z.object({});
export const MatchingPayloadSchema = z.object({
  pairs: z.array(z.object({ left: z.string().min(1), right: z.string().min(1) })).min(2),
});

export const ExercisePayloadSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("multiple_choice"), payload: MultipleChoicePayloadSchema }),
  z.object({ type: z.literal("fill_in_blank"), payload: FillInBlankPayloadSchema }),
  z.object({ type: z.literal("true_false"), payload: TrueFalsePayloadSchema }),
  z.object({ type: z.literal("matching"), payload: MatchingPayloadSchema }),
  // sentence_transformation / open_ended bez payloadu w S-06
]);
```

#### 1.2. Admin POST API — obsługa matching i Zod per type

**Plik**: `src/pages/api/admin/exercises/index.ts`

**Cel**: Rozszerzyć `ExerciseTypeEnum` o `matching` i wymusić walidację payloadu oraz kluczy zgodną z typem.

**Kontrakt**:
- `ExerciseTypeEnum` zawiera wszystkie sześć wartości z DB enum.
- `CreateExerciseSchema` używa `ExercisePayloadSchema` zamiast ogólnego `z.record(z.string(), z.unknown())` albo dodaje `.transform`/`.refine` sprawdzający kształt payloadu per type.
- Dla `multiple_choice` zachować obecną regułę: `keys[0]` musi być w `payload.options`.
- Dla `matching`: `payload.pairs` musi mieć ≥2 pary, `keys` zawiera DOKŁADNIE jeden string — JSON-ową mapę `{ leftIndex: rightIndex }` (`leftIndex` i `rightIndex` to indeksy w tablicy `pairs`).
- Dla `fill_in_blank` i `true_false` zostawiamy obecne reguły (`keys` zawiera warianty lub `"true"/"false"`).
- Dla `sentence_transformation` i `open_ended` zwracamy 400 z komunikatem o nieobsługiwanym typie.

#### 1.3. Admin UPDATE API — obsługa matching i Zod per type

**Plik**: `src/pages/api/admin/exercises/[id].ts`

**Cel**: Uaktualnić `UpdateExerciseSchema` i walidację tak, by edycja matchingu była możliwa, a nieobsługiwane typy były odrzucane.

**Kontrakt**: Identyczna logika walidacji payloadu/kluczy jak w `index.ts`. Zachować istniejący replace-all kluczy oraz fallback do starych kluczy w razie błędu insertu.

#### 1.4. ExerciseForm — edytor matchingu

**Plik**: `src/components/admin/ExerciseForm.tsx`

**Cel**: Dodać gałąź UI dla typu `matching` (dwie kolumny par, przyciski dodaj/usuń) i zaktualizować typy wejściowe/wyjściowe formularza.

**Kontrakt**:
- `type ExerciseType` rozszerzony o `"matching"`.
- Nowy stan: `pairs: { left: string; right: string }[]` z inicjalizacją z `initialPayload.pairs`.
- Funkcje `setPair`, `addPair`, `removePair` analogiczne do MC options.
- Walidacja matchingu: ≥2 niepustych par i poprawna mapa klucza.
- Submit payloadu:
  - MC: `{ options: ... }`
  - FIB/T-F: `{}`
  - matching: `{ pairs: pairs.filter(p => p.left.trim() && p.right.trim()) }`
- Submit kluczy:
  - MC: `[correctOption]`
  - FIB: `fibKeys.filter(k => k.trim())`
  - T-F: `[tfKey]`
  - matching: `[JSON.stringify(correctMap)]` gdzie `correctMap` mapuje indeks lewej strony na indeks prawej strony (np. `{ "0": "1", "1": "0" }`).

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- `npm run lint` przechodzi bez błędów.
- `npm run build` (Astro check) przechodzi.
- API admina odrzuca niepoprawny payload matchingu z czytelnym błędem 400.
- API admina odrzuca typy `sentence_transformation` i `open_ended` z komunikatem o nieobsługiwanym typie.

#### Weryfikacja ręczna:

- Admin może dodać ćwiczenie matching przez formularz.
- Admin może edytować istniejące ćwiczenie matching.
- Formularz nie pozwala zapisać matchingu z <2 parami lub pustymi wartościami.
- FIB i T/F działają jak dotychczas.

## Faza 2: Student renderers + LessonInteractive dispatcher + closedExerciseCount fix

### Przegląd

Dostarczamy komponenty dla studenta i naprawiamy liczenie ćwiczeń zamkniętych, aby lekcja wymagała rozwiązania wszystkich typów oprócz `open_ended`.

### Wymagane zmiany:

#### 2.1. Komponent FillInBlankExercise

**Plik**: `src/components/lesson/FillInBlankExercise.tsx` (nowy)

**Cel**: Renderować prompt z luką i jedno pole tekstowe; po zatwierdzeniu wysyłać odpowiedź do `/api/exercises/verify`.

**Kontrakt**:
- Props zgodny z `MultipleChoiceExercise`: `{ exercise: { id, prompt, payload }; onCorrect; disabled?; initialCorrectAnswer? }`.
- Pod promptem pojedyncze `<input type="text">` z placeholderem.
- Po submit: `fetch('/api/exercises/verify', { exercise_id, answer })`.
- Przy poprawnej odpowiedzi: `feedback = "correct"`, `locked = true`, wywołanie `onCorrect(exercise.id)`.
- Przy błędnej: `feedback = "incorrect"`, pozwól spróbować ponownie.
- Jeśli `initialCorrectAnswer` istnieje (review), input jest zablokowany i wypełniony poprawną odpowiedzią.

#### 2.2. Komponent TrueFalseExercise

**Plik**: `src/components/lesson/TrueFalseExercise.tsx` (nowy)

**Cel**: Renderować stwierdzenie i dwa radio "Prawda" / "Fałsz"; wysyłać `"true"` lub `"false"` do verify.

**Kontrakt**:
- Radio `value="true"` z etykietą "Prawda", `value="false"` z etykietą "Fałsz".
- Submit wysyła dokładnie `"true"` lub `"false"` (pasuje do kluczy generowanych przez admina).
- Pozostałe zachowania jak w FillInBlankExercise (feedback, lock, onCorrect, initialCorrectAnswer).

#### 2.3. Komponent MatchingExercise

**Plik**: `src/components/lesson/MatchingExercise.tsx` (nowy)

**Cel**: Renderować dwie kolumny par i pozwolić studentowi utworzyć mapowanie lewa→prawa, potem wysłać je jako JSON string.

**Kontrakt**:
- Props zgodny z pozostałymi rendererami.
- `payload.pairs` zawiera tablicę `{ left, right }`.
- UI MVP: dwie listy (`leftId` i `rightId`) — student wybiera jeden element z lewej i jeden z prawej, potem klika „Połącz”. Powstałe połączenia wyświetlają się jako lista; każde można usunąć.
- Połączenia są trzymane w stanie `Record<leftIndex, rightIndex>`.
- Przycisk "Sprawdź" wysyła `answer = JSON.stringify(map)` do verify.
- Wymagaj kompletnego mapowania wszystkich lewych stron przed submitem.
- Po poprawnej odpowiedzi: zablokuj, pokaż feedback, wywołaj `onCorrect`.
- W review mode (`initialCorrectAnswer` jako JSON string) wyświetl poprawne połączenia i zablokuj edycję.

#### 2.4. LessonInteractive dispatcher

**Plik**: `src/components/lesson/LessonInteractive.tsx`

**Cel**: Zastąpić pojedynczy `if (ex.type === "multiple_choice")` mapą dispatcherów dla MC/FIB/T-F/Matching; pozostawić placeholder dla `sentence_transformation` i `open_ended`.

**Kontrakt**:
- Obiekt `exerciseRenderers` lub `switch`:
  - `multiple_choice` → `MultipleChoiceExercise`
  - `fill_in_blank` → `FillInBlankExercise`
  - `true_false` → `TrueFalseExercise`
  - `matching` → `MatchingExercise`
  - `sentence_transformation`, `open_ended` → placeholder card z tekstem `[{ex.type}] — interaktywność dostępna wkrótce.`
- Każdy renderer otrzymuje `exercise` zrzutowany do odpowiedniego typu payloadu, `onCorrect`, `disabled={isCompleted}`, `initialCorrectAnswer={correctAnswers[ex.id]}`.

#### 2.5. closedExerciseCount fix

**Plik**: `src/pages/lessons/[id].astro`

**Cel**: Uznać za zamknięte wszystkie typy oprócz `open_ended`.

**Kontrakt**:
- Zamiana `exercises.filter((e) => e.type === "multiple_choice")` na `exercises.filter((e) => e.type !== "open_ended")`.
- Aktualizacja lub usunięcie komentarza "S-01: only multiple_choice is interactive...".

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- `npm run build` przechodzi.
- TypeScript nie zgłasza błędów w `LessonInteractive.tsx` po dodaniu nowych komponentów.

#### Weryfikacja ręczna:

- Student widzi i może rozwiązać FIB, T/F i matching w lekcji.
- Lekcja zawierająca tylko FIB/T-F/Matching nie zalicza się bez rozwiązania wszystkich ćwiczeń.
- `sentence_transformation` i `open_ended` nadal wyświetlają placeholder.

## Faza 3: verify.ts matching branch + review-mode correct answers

### Przegląd

Dostarczamy deterministyczną weryfikację dla matchingu oraz uzupełniamy review mode o wzorcowe odpowiedzi nowych typów.

### Wymagane zmiany:

#### 3.1. verify.ts — gałąź matching

**Plik**: `src/pages/api/exercises/verify.ts`

**Cel**: Rozpoznać typ `matching`, sparsować odpowiedź JSON i porównać mapy bez względu na kolejność iteracji.

**Kontrakt**:
- Schema body pozostaje `{ exercise_id, answer: z.string().min(1) }`.
- Pobierz `exercise.type` i `exercise.payload` wraz z kluczami.
- Dla `matching`:
  - Sparsuj `answer` do `Record<string, string>` (`studentMap`).
  - Odczytaj `exercise_keys[0].key_text` jako JSON i sparsuj do `Record<string, string>` (`correctMap`).
  - Zweryfikuj: ten sam zestaw kluczy lewych i dla każdego `leftId` `studentMap[leftId] === correctMap[leftId]`.
  - Zwróć `{ correct: true/false }`.
- Dla pozostałych zamkniętych typów zostaw obecną normalizację stringów.
- Dla `open_ended` (gdyby kiedykolwiek trafił do verify) zwróć `{ correct: false }` lub obsłuż osobno — w S-06 nie renderujemy przycisku submitu dla tego typu.

#### 3.2. Review-mode correct answers dla nowych typów

**Plik**: `src/pages/lessons/[id].astro`

**Cel**: Pobierać klucze dla FIB, T-F i matching, a nie tylko MC.

**Kontrakt**:
- Query do `exercise_keys` obejmuje wszystkie zamknięte typy (`type !== "open_ended"`), nie tylko MC.
- Dla FIB/T-F/MC: `correctAnswers[exercise_id] = key_text` pierwszego nie-reference-only klucza (zachować istniejącą logikę).
- Dla matching: `correctAnswers[exercise_id] = key_text` (zawiera JSON mapy) — `MatchingExercise` sam sparsuje.
- `sentence_transformation` pominięty (placeholder).

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Testy E2E dla matchingu przechodzą (dodane w Fazie 4).
- `npm run build` przechodzi.

#### Weryfikacja ręczna:

- Po ukończeniu lekcji student widzi poprawne odpowiedzi dla FIB, T-F i matching w trybie review.
- Niepoprawne mapowanie w matchingu jest odrzucane; poprawne — zaakceptowane.

## Faza 4: Seed data + E2E tests

### Przegląd

Aktualizujemy dane startowe i dodajemy testy Playwright pokrywające pełen cykl admin→student dla każdego nowego typu.

### Wymagane zmiany:

#### 4.1. Re-seed lesson_2_1 jako true_false

**Plik**: `supabase/seed.sql`

**Cel**: Zamienić ćwiczenie `lesson_2_1` z mock-MC (`options: ["True", "False"]`) na natywny typ `true_false`.

**Kontrakt**:
- `type = 'true_false'`
- `payload = '{}'`
- `key_text = 'true'` (lub `'false'` zgodnie z treścią ćwiczenia)

#### 4.2. E2E: admin tworzy każdy typ

**Plik**: `tests/e2e/admin-exercises.spec.ts` (nowy)

**Cel**: Zweryfikować, że admin może utworzyć FIB, T-F i matching oraz że nieobsługiwane typy są blokowane.

**Kontrakt**:
- Dla każdego typu (MC/FIB/T-F/Matching):
  - przejście do formularza dodawania ćwiczenia,
  - wypełnienie promptu i pól specyficznych dla typu,
  - submit i sprawdzenie przekierowania/ komunikatu sukcesu,
  - weryfikacja, że ćwiczenie pojawia się na liście.
- Test dla `sentence_transformation`/`open_ended` (jeśli admin może próbować): oczekiwany komunikat „not editable yet” na stronie edycji.

#### 4.3. E2E: student odpowiada poprawnie i zalicza lekcję

**Plik**: `tests/e2e/lesson-exercises.spec.ts` (nowy)

**Cel**: Zweryfikować, że student może rozwiązać każdy typ i że lekcja zostaje ukończona dopiero po wszystkich zamkniętych ćwiczeniach.

**Kontrakt**:
- Lekcja zawiera po jednym ćwiczeniu MC/FIB/T-F/Matching.
- Student odpowiada poprawnie na każde z nich (dla matchingu: poprawna mapa).
- Po rozwiązaniu wszystkich i kliknięciu "Przeczytano" lekcja zostaje oznaczona jako ukończona.
- Student wraca do lekcji i widzi review mode z poprawnymi odpowiedziami.

#### 4.4. E2E: closedExerciseCount regression

**Plik**: `tests/e2e/lesson-exercises.spec.ts`

**Cel**: Upewnić się, że lekcja bez MC ale z innymi zamkniętymi typami nie zalicza się przedwcześnie.

**Kontrakt**:
- Lekcja zawiera tylko FIB + T-F (bez MC).
- Przycisk "Przeczytano" jest wyłączony/daje błąd dopóki oba ćwiczenia nie są poprawne.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- `npx playwright test` przechodzi (lub odpowiedni projekt `e2e`/`e2e-student`).
- `npm run db:reset` + `npm run dev` startuje bez błędów seedu.

#### Weryfikacja ręczna:

- Świeży `supabase db reset` + `npm run dev` pokazuje `lesson_2_1` jako `true_false` i student może je rozwiązać.

## Strategia testowania

### Testy jednostkowe / komponentowe:

- Brak wymaganych — projekt nie posiada obecnie frameworka unit. Logikę weryfikacji matchingu przetestujemy przez E2E.

### Testy E2E (Playwright):

- **Admin CRUD per type** (`tests/e2e/admin-exercises.spec.ts`): tworzenie MC/FIB/T-F/Matching, guard dla `sentence_transformation`/`open_ended`.
- **Student solving + completion** (`tests/e2e/lesson-exercises.spec.ts`): pełny flow przez wszystkie zamknięte typy.
- **Completion gating regression**: lekcja bez MC nie zalicza się przedwcześnie.
- **Review mode**: poprawne odpowiedzi widoczne po ukończeniu lekcji.

### Kroki testowania ręcznego:

1. Zresetuj bazę: `npm run db:reset`.
2. Uruchom dev: `npm run dev`.
3. Zaloguj się jako admin i dodaj lekcję z ćwiczeniami FIB, T-F i Matching.
4. Zaloguj się jako student, otwórz lekcję, rozwiąż każde ćwiczenie.
5. Kliknij "Przeczytano" — lekcja powinna zostać ukończona.
6. Odśwież stronę — wszystkie ćwiczenia powinny być zablokowane z widocznymi poprawnymi odpowiedziami.
7. Sprawdź, że `sentence_transformation`/`open_ended` wciąż pokazują placeholder.

## Uwagi dotyczące wydajności

- Weryfikacja matchingu to parsowanie dwóch małych JSON-ów i porównanie map — O(n), nieznaczne obciążenie.
- Nie wprowadzamy dodatkowych zapytań do bazy poza jednym pobraniem typu ćwiczenia w `verify.ts`.
- Renderery studenta są prostymi komponentami React; brak ciężkich animacji.

## Uwagi dotyczące migracji

- Nie ma zmian schematu DB — wykorzystujemy istniejące `jsonb payload` i `exercise_keys`.
- Istniejące ćwiczenia FIB/T-F pozostają kompatybilne (payload `{}`, klucze stringi).
- Istniejące ćwiczenie `lesson_2_1` zostanie zmienione z `multiple_choice` na `true_false` — wymaga `supabase db reset` w środowisku dev; na produkcji seed nie jest aplikowany automatycznie.
- Jeśli w bazie istnieją już ćwiczenia `matching`, `sentence_transformation` lub `open_ended`, strona edycji wyświetli guard „not editable yet" zamiast próbować renderować je jako MC/FIB/T-F.

## Krytyczne szczegóły implementacji

- **Kolejność typów**: Faza 1 (typy + admin) MUSI być gotowa przed Fazą 2 (renderery studenta), bo nowe komponenty studenta zakładają istnienie payloadu `matching` zapisanego przez admina.
- **JSON klucza matchingu**: `exercise_keys.key_text` przechowuje mapę `{ leftIndex: rightIndex }` jako string. verify parsuje ją i porównuje ze stringiem odpowiedzi studenta. Należy upewnić się, że zarówno admin, jak i renderer studenta używają tego samego formatu (klucze jako stringi indeksów, wartości jako stringi indeksów).
- **Review mode dla matchingu**: `correctAnswers[ex.id]` będzie zawierać JSON string mapy; `MatchingExercise` musi go sparsować i wyrenderować poprawne połączenia.
- **Guard dla nieobsługiwanych typów**: w `src/pages/admin/exercises/[id]/edit.astro`, zanim zrenderuje się `ExerciseForm`, sprawdź `exercise.type`. Jeśli jest `sentence_transformation` lub `open_ended`, wyświetl `<AdminLayout>` z komunikatem „Ten typ ćwiczenia nie jest jeszcze edytowalny" zamiast formularza.

## Referencje

- Research: `context/changes/closed-exercises-fill-match-truefalse/research.md`
- PRD: `context/foundation/prd.md` (FR-018, FR-019, FR-023, FR-024)
- Poprzedni plan MC/FIB/T-F: `context/archive/2026-06-26-admin-content-creation/plan.md`
- Implementacja review F2: `context/archive/2026-06-25-first-lesson-end-to-end/reviews/impl-review.md`
- `src/components/admin/ExerciseForm.tsx`
- `src/pages/api/admin/exercises/index.ts`
- `src/pages/api/admin/exercises/[id].ts`
- `src/components/lesson/LessonInteractive.tsx`
- `src/components/lesson/MultipleChoiceExercise.tsx`
- `src/pages/api/exercises/verify.ts`
- `src/pages/lessons/[id].astro`
- `supabase/seed.sql`

## Postęp

### Faza 1: Schema/types + admin API validation + ExerciseForm matching branch

#### Automatyczne

- [ ] 1.1 `npm run lint` przechodzi po zmianach typów i schematów
- [ ] 1.2 `npm run build` przechodzi po aktualizacji admin API
- [ ] 1.3 Testy API ręcznie potwierdzają odrzucanie nieobsługiwanych typów i błędnego matchingu

#### Ręczne

- [ ] 1.4 Admin może dodać ćwiczenie matching z ≥2 parami
- [ ] 1.5 Admin może edytować istniejące ćwiczenie matching
- [ ] 1.6 FIB i T/F działają w adminie bez regresji

### Faza 2: Student renderers + LessonInteractive dispatcher + closedExerciseCount fix

#### Automatyczne

- [ ] 2.1 `npm run build` przechodzi po dodaniu rendererów
- [ ] 2.2 TypeScript nie zgłasza błędów w `LessonInteractive.tsx`

#### Ręczne

- [ ] 2.3 Student widzi i rozwiązuje FIB, T/F i matching w lekcji
- [ ] 2.4 Lekcja zawierająca tylko FIB/T-F/Matching nie zalicza się przedwcześnie
- [ ] 2.5 `sentence_transformation` i `open_ended` nadal wyświetlają placeholder

### Faza 3: verify.ts matching branch + review-mode correct answers

#### Automatyczne

- [ ] 3.1 Testy E2E dla matchingu przechodzą
- [ ] 3.2 `npm run build` przechodzi po zmianach w `verify.ts` i `[id].astro`

#### Ręczne

- [ ] 3.3 Niepoprawne mapowanie w matchingu jest odrzucane, poprawne zaakceptowane
- [ ] 3.4 Po ukończeniu lekcji widoczne są poprawne odpowiedzi dla FIB, T/F i matching

### Faza 4: Seed data + E2E tests

#### Automatyczne

- [ ] 4.1 `npx playwright test` przechodzi
- [ ] 4.2 `npm run db:reset` + `npm run dev` startuje bez błędów

#### Ręczne

- [ ] 4.3 Świeży seed pokazuje `lesson_2_1` jako `true_false` i student może je rozwiązać
- [ ] 4.4 Lekcja bez MC ale z FIB + T-F nie zalicza się przedwcześnie