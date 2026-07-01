# Plan wdrożenia — Server-side lesson completion gating

## Przegląd

Przenosimy regułę ukończenia lekcji (FR-015) z warstwy UI na warstwę serwerową. Dziś komponent `LessonInteractive.tsx` blokuje przycisk „Przeczytano”, ale endpoint `POST /api/lessons/[id]/complete` zapisuje `lesson_progress` bez walidacji. Po wdrożeniu serwer będzie odrzucał ukończenie, dopóki student nie rozwiąże wszystkich ćwiczeń zamkniętych w danej lekcji, a odpowiedzi będą utrwalane w nowej tabeli `exercise_submissions`.

## Analiza stanu obecnego

- **UI gating**: `LessonInteractive` otrzymuje `closedExerciseCount` z Astro, przechowuje `completedExercises` w React stanie i blokuje przycisk, gdy `completedExercises.size < closedExerciseCount` (`src/components/lesson/LessonInteractive.tsx:36-98`). Stan ten jest ulotny i nie jest przesyłany na serwer.
- **Endpoint ukończenia**: `POST /api/lessons/[id]/complete` waliduje UUID i użytkownika, po czym wykonuje `upsert` do `lesson_progress` z `ignoreDuplicates: true` (`src/pages/api/lessons/[id]/complete.ts:17-32`). Nie sprawdza rozwiązanych ćwiczeń.
- **Weryfikacja odpowiedzi**: `POST /api/exercises/verify` pobiera klucze, wywołuje `verifyExercise()` i zwraca `{ correct: boolean }`, ale nie zapisuje wyniku (`src/pages/api/exercises/verify.ts:43-67`).
- **Baza**: `lesson_progress` jest append-only (brak UPDATE/DELETE RLS) — `supabase/migrations/20260625184555_init.sql:401-416`. Nie ma tabeli utrwalającej poprawność odpowiedzi studenta.
- **Testy**: `tests/integration/lesson-completion.spec.ts` dokumentuje lukę (`:30-37`) i zawiera `test.skip` dla przyszłego testu negatywnego (`:48-50`).

## Pożądany stan końcowy

1. Istnieje tabela `exercise_submissions` z RLS, do której trafiają poprawne odpowiedzi zamkniętych ćwiczeń.
2. `POST /api/exercises/verify` zapisuje poprawną odpowiedź zamkłętego ćwiczenia do `exercise_submissions`.
3. `POST /api/lessons/[id]/complete` ładuje agregat `LessonCompletion`, który przed zapisem sprawdza:
   - dostęp do lekcji (I-5),
   - brak wcześniejszego ukończenia (I-3),
   - wszystkie ćwiczenia zamknięte mają poprawne submission (I-1),
   - ćwiczenia otwarte są ignorowane (I-2).
4. UI nadal lokalnie blokuje przycisk dla UX, ale serwer jest źródłem prawdy i zwraca 409 przy niespełnionym inwariancie.
5. Testy jednostkowe agregatu i zaktualizowane testy integracyjne pokrywają legalne i nielegalne przypadki.

### Kluczowe odkrycia

- `open_ended` nigdy nie jest uznawane za poprawne (`src/lib/verify-exercise.ts:73-82`), więc naturalnie nie wymaga submission do ukończenia.
- `lesson_progress` jest nieodwracalne — nie dodajemy możliwości cofnięcia ukończenia.
- RLS `has_exercise_access` i `has_lesson_access` już egzekwują dostęp; wystarczy je wykorzystać w politykach nowej tabeli.

## Czego NIE robimy

- Nie tworzymy historii wszystkich prób — tylko ostatnie poprawne rozwiązanie na ćwiczenie.
- Nie dodajemy triggera DB w pierwszej iteracji (zalecenie advisor); inwariant żyje w agregacie.
- Nie zmieniamy zachowania ćwiczeń otwartych — nadal nie blokują ukończenia.
- Nie wdrażamy automatycznego ukończenia lekcji po ostatnim poprawnym ćwiczeniu; wciąż wymagamy kliknięcia „Przeczytano”.
- Nie dotykamy admin CRUD, zarządzania użytkownikami ani nawigacji „Kontynuuj naukę”.

## Podejście do implementacji

Stosujemy wzorzec **agregatu domenowego + cienkiego API**:

1. Najpierw model danych: migracja tworzy `exercise_submissions` jako append-only tabelę RLS.
2. Potem domena: `LessonCompletion` ładuje stan (lekcja, ćwiczenia, poprawne submissions, istniejący progress) i decyduje, czy można ukończyć.
3. Następnie wiring: `verify.ts` zapisuje poprawne odpowiedzi, `complete.ts` używa agregatu.
4. UI i testy: utrzymujemy lokalny gating, dodajemy testy jednostkowe agregatu i aktualizujemy testy integracyjne.

## Faza 1: Migracja i model danych

### Przegląd

Dodajemy tabelę `exercise_submissions` oraz jej RLS, wykorzystując istniejące helpery dostępu. Regenerujemy typy bazy i aktualizujemy seed dane testowe.

### Wymagane zmiany

#### 1. Nowa migracja SQL

**Plik**: `supabase/migrations/20260701190000_add_exercise_submissions.sql`

**Cel**: Utworzyć append-only tabelę przechowującą poprawne odpowiedzi studentów na ćwiczenia zamknięte.

**Kontrakt**:
```sql
create table public.exercise_submissions (
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  answer text not null,
  is_correct boolean not null,
  submitted_at timestamptz not null default now(),
  primary key (user_id, exercise_id)
);
```
- `is_correct` zawsze `true` dla zamkniętych ćwiczeń (wiersze powstają tylko po poprawnej odpowiedzi).
- Brak polityk UPDATE/DELETE, analogicznie do `lesson_progress`.

#### 2. RLS dla nowej tabeli

**Plik**: `supabase/migrations/20260701190000_add_exercise_submissions.sql`

**Cel**: Student widzi tylko swoje wiersze i może zapisać tylko własne poprawne odpowiedzi do ćwiczeń, do których ma dostęp.

**Kontrakt**:
- `SELECT`: `user_id = auth.uid() or is_admin()`.
- `INSERT`: **brak polityki dla authenticated** — wiersze są zapisywane wyłącznie przez service-role API route (`createAdminClient`), który najpierw samodzielnie weryfikuje odpowiedź. To zapobiega sytuacji, w której zalogowany klient oznacza własne ćwiczenia jako poprawne.
- Brak `UPDATE`/`DELETE`.
- CHECK constraint: `is_correct = true`.
- Indeks: `create index exercise_submissions_exercise_id_idx on public.exercise_submissions(exercise_id);`.

#### 3. Regeneracja typów

**Plik**: `src/lib/database.types.ts`

**Cel**: Uwzględnić nową tabelę w generowanych typach Supabase.

**Kontrakt**: Po uruchomieniu `npx supabase gen types typescript --local > src/lib/database.types.ts` typy odzwierciedlają nową tabelę.

#### 4. Seed danych testowych

**Plik**: `supabase/seed.sql`

**Cel**: Dodać wiersze `exercise_submissions` dla studenta i zamkniętych ćwiczeń, aby testy integracyjne mogły weryfikować pozytywną ścieżkę.

**Kontrakt**: Co najmniej jeden wiersz dla `sentence_transformation` z lekcji `LESSON_CLOSED_PLUS_OPEN` dla studenta `00000000-0000-0000-0000-000000000002`.

### Kryteria sukcesu

#### Weryfikacja automatyczna

- Migracja aplikuje się czysto lokalnie: `npx supabase db reset`.
- Typy są aktualne: `npm run typecheck`.
- Tabela pojawia się w `src/lib/database.types.ts`.

#### Weryfikacja ręczna

- Polityki RLS działają zgodnie z oczekiwaniami: student nie może INSERTować submission dla cudzego ćwiczenia.

## Faza 2: Domena i utrwalanie poprawnych odpowiedzi

### Przegląd

Dodajemy agregat `LessonCompletion` i usługę zapisującą poprawne odpowiedzi z `verify.ts`.

### Wymagane zmiany

#### 1. Nazwane błędy domenowe

**Plik**: `src/lib/errors/lesson-completion.ts`

**Cel**: Zapewnić typowe błędy, które API mapuje na statusy HTTP.

**Kontrakt**:
- `LessonNotAccessibleError`
- `LessonAlreadyCompletedError`
- `ClosedExercisesNotSolvedError` — zawiera listę nierozwiązanych `exercise_id`.

#### 2. Agregat `LessonCompletion`

**Plik**: `src/lib/services/lesson-completion.ts`

**Cel**: Centralne miejsce decyzji o ukończeniu lekcji, testowalne jednostkowo.

**Kontrakt**:
```ts
export class LessonCompletion {
  constructor(
    private lessonId: string,
    private userId: string,
    private closedExerciseIds: string[],
    private solvedExerciseIds: Set<string>,
    private isAlreadyCompleted: boolean,
  ) {}

  markComplete(): { lesson_id: string; user_id: string; completed_at: Date } {
    // rzuca nazwane błędy przy niespełnionych preconditions
  }
}
```
- `closedExerciseIds` = wszystkie ćwiczenia lekcji oprócz `open_ended`.
- `solvedExerciseIds` = zbiór `exercise_id` z `exercise_submissions` dla tego użytkownika.
- Inwariant: `closedExerciseIds.every(id => solvedExerciseIds.has(id))`.

#### 3. Repozytorium / loader

**Plik**: `src/lib/services/lesson-completion.repository.ts`

**Cel**: Ładować stan potrzebny agregatowi z Supabase.

**Kontrakt**:
- `loadLessonCompletion(supabase, userId, lessonId): Promise<LessonCompletion>`.
- Zwracał błąd `LessonNotAccessibleError`, jeśli lekcja nie istnieje lub brak dostępu.
- Po zatwierdzeniu agregatu: `saveLessonCompletion(supabase, result)` wykonuje `insert` do `lesson_progress` (obsługuje konflikt jako idempotentność).

#### 4. Utrwalanie poprawnych odpowiedzi z `verify.ts`

**Plik**: `src/pages/api/exercises/verify.ts`

**Cel**: Gdy `verifyExercise` zwróci `true` dla ćwiczenia zamkniętego, zapisać submission.

**Kontrakt**:
- Po obliczeniu `correct`:
  ```ts
  if (correct && exerciseType !== "open_ended") {
    await supabase.from("exercise_submissions").upsert(
      { user_id: user.id, exercise_id, answer, is_correct: true },
      { onConflict: "user_id,exercise_id", ignoreDuplicates: false }, // aktualizuje answer
    );
  }
  ```
- Nie zapisujemy odpowiedzi dla `open_ended`.

### Kryteria sukcesu

#### Weryfikacja automatyczna

- `npm run test:unit` — nowe testy agregatu (`src/lib/services/lesson-completion.test.ts`) przechodzą.
- `npm run lint` i `npm run typecheck` są czyste.
- Testy integracyjne dla `verify.ts` (jeśli istnieją) nadal przechodzą.

#### Weryfikacja ręczna

- Wywołanie `verify.ts` dla poprawnej odpowiedzi tworzy wiersz w `exercise_submissions`.
- Agregat rzuca `ClosedExercisesNotSolvedError`, gdy brakuje submission.

## Faza 3: Endpoint completion i UI

### Przegląd

Podłączamy agregat pod endpoint ukończenia i aktualizujemy UI, aby obsługiwał nowe błędy serwera. Aktualizujemy również testy integracyjne.

### Wymagane zmiany

#### 1. Refactor `POST /api/lessons/[id]/complete`

**Plik**: `src/pages/api/lessons/[id]/complete.ts`

**Cel**: Zastąpić bezpośredni `upsert` wywołaniem agregatu.

**Kontrakt**:
- Po walidacji UUID i użytkownika:
  ```ts
  const completion = await loadLessonCompletion(supabase, user.id, validLessonId);
  try {
    const result = completion.markComplete();
    await saveLessonCompletion(supabase, result);
    return Response.json({ success: true }, { status: 200 });
  } catch (error) {
    if (error instanceof LessonAlreadyCompletedError) return Response.json({ success: true }, { status: 200 });
    if (error instanceof ClosedExercisesNotSolvedError) return Response.json({ error: "Nie rozwiązano wszystkich ćwiczeń zamkniętych" }, { status: 409 });
    if (error instanceof LessonNotAccessibleError) return Response.json({ error: "Forbidden" }, { status: 403 });
    throw error;
  }
  ```
- Usuwamy bezpośredni `upsert` do `lesson_progress`.

#### 2. Obsługa błędu 409 w UI

**Plik**: `src/components/lesson/LessonInteractive.tsx`

**Cel**: Wyświetlić komunikat serwera, gdy ukończenie zostanie odrzucone.

**Kontrakt**:
- Zachowujemy lokalny gating (UX), ale nie polegamy na nim jako jedynym zabezpieczeniu.
- `handleMarkRead` wyświetla `data.error` lub fallback dla 409.

#### 3. Aktualizacja testów integracyjnych

**Plik**: `tests/integration/lesson-completion.spec.ts`

**Cel**: Zamienić `test.skip` na aktywny test negatywny i dodać pozytywny przypadek z rozwiązanym ćwiczeniem.

**Kontrakt**:
- Zamienić test „lesson with closed + open exercises can be completed without solving” na test negatywny oczekujący 409.
- Dodać test, w którym student najpierw poprawnie odpowie na `sentence_transformation` (`/api/exercises/verify`), a potem ukończy lekcję (200).
- Aktywować `test.skip("server rejects completion when closed exercises are unsolved")`.

### Kryteria sukcesu

#### Weryfikacja automatyczna

- `npm run test:unit` przechodzi.
- `npm run lint` i `npm run typecheck` są czyste.
- `npx playwright test --project=integration` przechodzi (wymaga uruchomionej lokalnej Supabase).

#### Weryfikacja ręczna

- Student bez rozwiązania zamkniętego ćwiczenia dostaje 409 i widzi komunikat.
- Student po poprawnej odpowiedzi może ukończyć lekcję.
- Lekcja bez ćwiczeń (reading-only) nadal może być ukończona (200).

## Strategia testowania

### Testy jednostkowe

**Plik**: `src/lib/services/lesson-completion.test.ts`

- Legalne ukończenie: wszystkie zamknięte ćwiczenia rozwiązane.
- Legalne ukończenie: lekcja bez ćwiczeń.
- Legalne ukończenie: tylko ćwiczenia otwarte — brak wymaganych submissions.
- Nielegalne ukończenie: brakuje jednego zamkniętego ćwiczenia → `ClosedExercisesNotSolvedError`.
- Idempotentność: ponowne ukończenie → `LessonAlreadyCompletedError`.
- Brak dostępu → `LessonNotAccessibleError`.

### Testy integracyjne

**Plik**: `tests/integration/lesson-completion.spec.ts`

- Reading-only lesson → 200.
- Closed+open lesson bez rozwiązania → 409.
- Closed+open lesson z poprawnym verify → 200.
- Idempotencja ponownego ukończenia → 200.

### Testowanie ręczne

1. Otwórz lekcję z zamkniętym ćwiczeniem, nie rozwiązując go — przycisk „Przeczytano” powinien być zablokowany.
2. Spróbuj wywołać `POST /api/lessons/{id}/complete` ręcznie (curl) — powinien zwrócić 409.
3. Rozwiąż ćwiczenie poprawnie — przycisk powinien się odblokować.
4. Kliknij „Przeczytano” — lekcja oznaczona jako ukończona.
5. Odśwież stronę — badge „Ukończona” pozostaje.

## Uwagi dotyczące wydajności

- Zapytanie agregatu: jeden SELECT z `exercises` (liczba zamkniętych) + jeden SELECT z `exercise_submissions` (rozwiązane). Oba po indeksach PK/FK.
- Brak potrzeby paginacji — liczba ćwiczeń w lekcji jest mała.
- `exercise_submissions` jest append-only, więc nie ma narzutu UPDATE/DELETE.

## Uwagi dotyczące migracji

- Migracja jest czysto addytywna — nie zmienia istniejących tabel.
- Istniejące wiersze `lesson_progress` pozostają ważne; nie ma potrzeby backfillu, bo zmiana dotyczy tylko nowych ukończeń.
- Wdrożenie przyrostowe: Faza 1 i 2 mogą iść na produkcję bez Fazy 3, ponieważ `exercise_submissions` jest nieużywanym aż do momentu włączenia gating w endpointcie.

## Krytyczne szczegóły implementacji

- **Sekwencjonowanie**: Faza 1 musi być gotowa przed Fazą 2, a Faza 2 przed Fazą 3. Nie można włączyć gating w `complete.ts`, dopóki `verify.ts` nie zapisuje submissions.
- **RLS i `ignoreDuplicates`**: w `complete.ts` nie używamy już `ignoreDuplicates` w agregacie — `LessonAlreadyCompletedError` jest obsługiwana explicitnie. W `verify.ts` używamy `upsert` z aktualizacją `answer`, jeśli student poda inną, równie poprawną wersję.
- **Nieodwracalność**: agregat nigdy nie usuwa `lesson_progress`. Błąd `ClosedExercisesNotSolvedError` jest zgłaszany przed jakimkolwikiem zapisem.

## Referencje

- `context/changes/server-side-lesson-completion-gating/research.md`
- `context/domain/02-invariant-aggregate-refactor.md`
- `context/foundation/test-plan.md` — ryzyko #6
- `context/foundation/prd.md` — FR-015, guardrails

## Postęp

### Faza 1: Migracja i model danych

#### Automatyczne

- [x] 1.1 Utworzyć migrację `exercise_submissions` z RLS.
- [x] 1.2 Zregenerować `src/lib/database.types.ts`.
- [x] 1.3 Uaktualnić `supabase/seed.sql` o testowe submissions.

#### Ręczne

- [x] 1.4 Zweryfikować RLS — student nie może zapisać cudzego submission.

### Faza 2: Domena i utrwalanie poprawnych odpowiedzi

#### Automatyczne

- [ ] 2.1 Dodać nazwane błędy domenowe.
- [ ] 2.2 Zaimplementować agregat `LessonCompletion`.
- [ ] 2.3 Dodać repozytorium ładujące/zapisujące agregat.
- [ ] 2.4 Zmodyfikować `verify.ts`, aby zapisywał poprawne submissions.
- [ ] 2.5 Napisać testy jednostkowe agregatu.

#### Ręczne

- [ ] 2.6 Potwierdzić, że poprawna odpowiedź tworzy wiersz w `exercise_submissions`.

### Faza 3: Endpoint completion i UI

#### Automatyczne

- [ ] 3.1 Zastąpić logikę w `complete.ts` wywołaniem agregatu.
- [ ] 3.2 Zaktualizować `LessonInteractive.tsx` do obsługi 409.
- [ ] 3.3 Aktywować i rozszerzyć `tests/integration/lesson-completion.spec.ts`.
- [ ] 3.4 Uruchomić `npm run test:unit`, `npm run lint`, `npm run typecheck`.

#### Ręczne

- [ ] 3.5 Przeprowadzić ręczny przepływ: odmowa ukończenia bez rozwiązania, sukces po rozwiązaniu.
