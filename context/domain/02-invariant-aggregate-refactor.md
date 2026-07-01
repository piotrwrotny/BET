---
title: BET — plan refaktoryzacji inwariantu / agregatu ukończenia lekcji
created: 2026-07-01
type: refactor-plan
---

# KROK 0 — Context discovery

Celem refaktoryzacji jest przeniesienie reguły biznesowej ukończenia lekcji (FR-015) z warstwy UI do warstwy domenowej na serwerze. Obecnie przycisk „Przeczytano" w komponencie `LessonInteractive.tsx` blokuje zapis, dopóki student nie rozwiąże wszystkich ćwiczeń zamkniętych, ale endpoint `POST /api/lessons/[id]/complete` zapisuje postęp bez jakiejkolwiek walidacji (`tests/integration/lesson-completion.spec.ts:30-37` dokumentuje tę lukę).

To jest luka **trust boundary**: każdy klient (przeglądarka, skrypt curl, zmodyfikowana aplikacja) może oznaczyć lekcję jako ukończoną bez wykonania ćwiczeń. Narusza to główne kryterium sukcesu z PRD (`context/foundation/prd.md:35`) oraz guardrail „Postęp studenta nie może zaginąć ani się zresetować" (`context/foundation/prd.md:46`) w rozumieniu „nie może być fałszowany".

Kontekst techniczny:
- Baza: PostgreSQL via Supabase; `lesson_progress` jest append-only (brak UPDATE/DELETE RLS) — `supabase/migrations/20260625184555_init.sql:319-323`.
- Weryfikacja odpowiedzi: `src/lib/verify-exercise.ts` (pure function, 100% pokrycia testami).
- Stan po stronie klienta: `LessonInteractive.tsx` trzyma zbiór `completedExercises` i liczbę `closedExerciseCount` — `src/components/lesson/LessonInteractive.tsx:42-62`.
- Brak tabeli przechowującej historię / poprawność odpowiedzi studenta — odpowiedź jest tylko chwilowym payloadem `POST /api/exercises/verify`.

---

# KROK 1 — Identyfikacja inwariantów biznesowych

Z PRD i kodu wynikają następujące inwarianty związane z ukończeniem lekcji:

| ID | Inwariant | Źródło (cytat) |
|---|---|---|
| I-1 | Lekcja jest ukończona **wtedy i tylko wtedy**, gdy student kliknął „Przeczytano" **ORAZ** wszystkie ćwiczenia zamknięte zostały poprawnie rozwiązane. | `context/foundation/prd.md:96-99`, `context/foundation/prd.md:131-132` |
| I-2 | Ćwiczenia otwarte **nie blokują** ukończenia lekcji. | `context/foundation/prd.md:116` |
| I-3 | Stan ukończenia lekcji jest **nieodwracalny** — nie resetuje się przy ponownym wejściu. | `context/foundation/prd.md:133`, `supabase/migrations/20260625184555_init.sql:319-323` |
| I-4 | Weryfikacja odpowiedzi zamkniętych jest **deterministyczna** i opiera się na liście dopuszczalnych wariantów. | `context/foundation/prd.md:111-113` |
| I-5 | Student może ukończyć tylko lekcje, do których ma dostęp (poprzez `user_book_access`). | `context/foundation/prd.md:138`, RLS w `supabase/migrations/20260625184555_init.sql:125-148` |

Wynikowy **inwariant złożony** dla agregatu:

> `markComplete(userId, lessonId)` może zostać wykonane tylko jeśli:
> 1. Lekcja istnieje i użytkownik ma do niej dostęp (I-5).
> 2. Lekcja nie została już wcześniej ukończona (I-3, idempotentność).
> 3. Wszystkie ćwiczenia zamknięte w lekcji mają zapisane poprawne rozwiązanie dla tego użytkownika (I-1).
> 4. Ćwiczenia otwarte są ignorowane przy sprawdzaniu (I-2).

---

# KROK 2 — Klasyfikacja i wybór inwariantu #1

## Klasyfikacja

| Inwariant | Typ | Moc egzekwowania obecnie | Wpływ na produkt |
|---|---|---|---|
| I-1 | Core / scattered | **Słabo** — rozproszony między UI (egzekwowany) a serwer (ignorowany) | Krytyczny — fałszuje postęp studenta |
| I-2 | Core / deklarowany | Egzekwowany pośrednio przez UI (`closedExerciseCount` nie liczy `open_ended`) | Średni — łatwo przenieść wraz z I-1 |
| I-3 | Core / egzekwowany | Mocno — brak UPDATE/DELETE RLS na `lesson_progress` | Niski — już działa |
| I-4 | Core / egzekwowany | Mocno — `verify-exercise.ts` + testy | Niski — już działa |
| I-5 | Supporting / egzekowany | Mocno — RLS + middleware | Niski — już działa |

## Dlaczego I-1 jest #1

1. **Kryteria sukcesu produktu:** Główne kryterium sukcesu mówi, że student widzi, iż lekcja / rozdział „zaliczyły się" po wykonaniu ćwiczenia (`context/foundation/prd.md:35`). Jeśli serwer akceptuje ukończenie bez ćwiczeń, to kryterium jest iluzoryczne.
2. **Guardrail:** „Postęp studenta nie może zaginąć ani się zresetować" (`context/foundation/prd.md:46`) obejmuje również integralność danych — postęp nie może być fałszowany przez zewnętrzny klient.
3. **Mapa ryzyk:** Test-plan ryzyko #6 (`context/foundation/test-plan.md:24`) brzmi: *„Completion gating wrongly requires open-ended exercise or ignores a missing closed exercise"* i ma wpływ **High**.
4. **Dowód luki:** `tests/integration/lesson-completion.spec.ts:30-37` jawnie dokumentuje, że lekcja z zamkniętym ćwiczeniem może zostać ukończona bez jego rozwiązania.
5. **Trust boundary:** To jedyna reguła core, która jest egzekwowana **wyłącznie po stronie klienta**, podczas gdy serwer powinien być źródłem prawdy.

**Decyzja:** Inwariant #1 = **Lesson completion gating (I-1)**, wzmocniony przez I-2, I-3 i I-5.

---

# KROK 3 — Diagnoza: gdzie dziś mieszka ta reguła

Reguła jest rozproszona na cztery warstwy:

| Warstwa | Plik / linia | Co robi | Problem |
|---|---|---|---|
| **Baza danych (DDL + RLS)** | `supabase/migrations/20260625184555_init.sql:319-323` | `lesson_progress` bez UPDATE/DELETE; chroni nieodwracalność, ale nie waliduje warunków wstępnych. | Nie ma triggera / constraintu sprawdzającego poprawność ćwiczeń. |
| **API / route** | `src/pages/api/lessons/[id]/complete.ts:27-30` | Wykonuje `upsert` do `lesson_progress` bez walidacji. | Jest źródłem luki — akceptuje dowolne ukończenie. |
| **Serwis / domain** | *BRAK* | Nie ma warstwy domenowej. | Logika miesza się z API i UI. |
| **UI / komponent** | `src/components/lesson/LessonInteractive.tsx:42-62` oraz `130-167` | Sprawdza `completedExercises.size < closedExerciseCount` i disabluje przycisk. | Klient może być pominięty — reguła nie jest egzekwowana serwerowo. |
| **Testy** | `tests/integration/lesson-completion.spec.ts:30-37` | Dokumentuje obecne zachowanie jako „current server behaviour". | Potwierdza lukę. |

Brakujący element: **tabela zapisująca poprawność rozwiązania ćwiczenia przez użytkownika**. Bez niej serwer nie wie, które ćwiczenia zostały poprawnie rozwiązane. Obecnie `verify.ts` weryfikuje odpowiedź, ale jej nie utrwala.

---

# KROK 4 — Projekt agregatu-gwardzisty

## 4.1 Granica agregatu

**Agregat:** `LessonCompletion`
**Root:** operacja `markComplete(userId, lessonId)`
**Stan wewnętrzny:**
- `lessonId: string`
- `userId: string`
- `isAlreadyCompleted: boolean`
- `closedExerciseIds: string[]` — id ćwiczeń zamkniętych w lekcji (bez `open_ended`)
- `correctlySolvedExerciseIds: Set<string>` — id zamkniętych ćwiczeń, które użytkownik rozwiązał poprawnie

**Wyjście:** zdarzenie domenowe `LessonCompletedEvent { userId, lessonId, completedAt }` (w MVP może być bezpośredni zapis do repo, bez event bus).

## 4.2 Błędy domenowe (named domain errors)

```ts
export class LessonCompletionError extends Error {}

export class LessonNotAccessibleError extends LessonCompletionError {
  constructor(public readonly lessonId: string) {
    super(`Lesson ${lessonId} is not accessible for the user`);
  }
}

export class LessonAlreadyCompletedError extends LessonCompletionError {
  constructor(public readonly lessonId: string) {
    super(`Lesson ${lessonId} is already completed`);
  }
}

export class ClosedExercisesNotSolvedError extends LessonCompletionError {
  constructor(public readonly lessonId: string, public readonly exerciseIds: string[]) {
    super(`Lesson ${lessonId} cannot be completed; closed exercises not solved: ${exerciseIds.join(", ")}`);
  }
}
```

## 4.3 Nowa tabela: `exercise_submissions`

Aby agregat mógł sprawdzić inwariant, serwer musi pamiętać, że dane zamknięte ćwiczenie zostało poprawnie rozwiązane. Dodajemy tabelę append-only (brak UPDATE/DELETE):

```sql
-- 1. Tabela utrwalająca weryfikację odpowiedzi zamkniętych
CREATE TABLE public.exercise_submissions (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exercise_id uuid NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  answer text NOT NULL,
  is_correct boolean NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, exercise_id)
);

CREATE INDEX exercise_submissions_exercise_id_idx ON public.exercise_submissions(exercise_id);

-- 2. RLS — student widzi i zapisuje tylko własne rozwiązania na dostępnych ćwiczeniach
ALTER TABLE public.exercise_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY exercise_submissions_select ON public.exercise_submissions
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

CREATE POLICY exercise_submissions_insert ON public.exercise_submissions
  FOR INSERT TO authenticated WITH CHECK (
    user_id = (SELECT auth.uid())
    AND (SELECT private.has_exercise_access(exercise_id))
  );
```

**Uwaga:** Polityka INSERT musi zostać rozszerzona, gdy `private.has_exercise_access` zostanie przywrócone do ścisłego modelu dostępu (obecnie `20260629000000_open_book_access_for_students.sql` zwraca `true` dla wszystkich zalogowanych).

## 4.4 Repozytorium

```ts
// src/domain/lesson-completion.ts
export interface LessonCompletionRepository {
  load(userId: string, lessonId: string): Promise<LessonCompletion>;
  save(event: LessonCompletedEvent): Promise<void>;
}

// src/lib/services/lesson-completion.repository.ts
export class SupabaseLessonCompletionRepository implements LessonCompletionRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async load(userId: string, lessonId: string): Promise<LessonCompletion> {
    // 1. lesson + exercises + keys
    const { data: lesson, error } = await this.supabase
      .from("lessons")
      .select(`id, exercises(id, type)`)
      .eq("id", lessonId)
      .single();
    if (error || !lesson) throw new LessonNotAccessibleError(lessonId);

    // 2. existing completion
    const { data: progress } = await this.supabase
      .from("lesson_progress")
      .select("lesson_id")
      .eq("user_id", userId)
      .eq("lesson_id", lessonId)
      .maybeSingle();

    // 3. solved closed exercises
    const exerciseIds = (lesson.exercises ?? []).map((e) => e.id as string);
    const { data: submissions } = await this.supabase
      .from("exercise_submissions")
      .select("exercise_id, is_correct")
      .eq("user_id", userId)
      .in("exercise_id", exerciseIds);

    const correctIds = new Set(
      (submissions ?? []).filter((s) => s.is_correct).map((s) => s.exercise_id as string)
    );

    const closedExerciseIds = (lesson.exercises ?? [])
      .filter((e) => (e.type as string) !== "open_ended")
      .map((e) => e.id as string);

    return new LessonCompletion(
      userId,
      lessonId,
      closedExerciseIds,
      correctIds,
      progress !== null
    );
  }

  async save(event: LessonCompletedEvent): Promise<void> {
    const { error } = await this.supabase
      .from("lesson_progress")
      .insert({ user_id: event.userId, lesson_id: event.lessonId });
    if (error) throw error;
  }
}
```

## 4.5 Agregat

```ts
// src/domain/lesson-completion.ts
export class LessonCompletion {
  constructor(
    public readonly userId: string,
    public readonly lessonId: string,
    private readonly closedExerciseIds: string[],
    private readonly correctlySolvedExerciseIds: Set<string>,
    public readonly isAlreadyCompleted: boolean
  ) {}

  markComplete(): LessonCompletedEvent {
    if (this.isAlreadyCompleted) {
      throw new LessonAlreadyCompletedError(this.lessonId);
    }

    const unsolved = this.closedExerciseIds.filter(
      (id) => !this.correctlySolvedExerciseIds.has(id)
    );
    if (unsolved.length > 0) {
      throw new ClosedExercisesNotSolvedError(this.lessonId, unsolved);
    }

    return {
      type: "LessonCompleted",
      userId: this.userId,
      lessonId: this.lessonId,
      completedAt: new Date(),
    };
  }
}
```

## 4.6 Cienkie mapowanie API / route

```ts
// src/pages/api/lessons/[id]/complete.ts (po refaktoryzacji)
export const POST: APIRoute = async (context) => {
  // ...auth + UUID validation (bez zmian) ...

  const repo = new SupabaseLessonCompletionRepository(supabase);
  const completion = await repo.load(user.id, validLessonId);

  try {
    const event = completion.markComplete();
    await repo.save(event);
    return Response.json({ success: true }, { status: 200 });
  } catch (err) {
    if (err instanceof LessonAlreadyCompletedError) {
      return Response.json({ success: true }, { status: 200 }); // idempotent success
    }
    if (err instanceof ClosedExercisesNotSolvedError) {
      return Response.json({ error: "Najpierw rozwiąż wszystkie ćwiczenia zamknięte." }, { status: 409 });
    }
    if (err instanceof LessonNotAccessibleError) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    throw err;
  }
};
```

## 4.7 Integracja z `verify.ts`

Po pomyślnej weryfikacji zamkniętego ćwiczenia zapisujemy wynik w `exercise_submissions`:

```ts
// src/pages/api/exercises/verify.ts (fragment)
const correct = verifyExercise(exerciseType, answer, keys);

if (correct) {
  await supabase.from("exercise_submissions").upsert(
    { user_id: user.id, exercise_id, answer, is_correct: true },
    { onConflict: "user_id,exercise_id" }
  );
}

return Response.json({ correct });
```

Dla ćwiczeń otwartych **nie** zapisujemy submission (`verifyExercise` zwraca `false` dla `open_ended`).

---

# KROK 5 — Before / after, plan fazowy, przypadki test-first

## 5.1 Before / after

| Aspekt | Before | After |
|---|---|---|
| Źródło prawdy ukończenia | UI (`LessonInteractive.tsx`) | Serwerowy agregat `LessonCompletion` |
| Trwałość poprawnych odpowiedzi | Brak — odpowiedź znika po weryfikacji | Tabela `exercise_submissions` |
| Endpoint `/api/lessons/[id]/complete` | `upsert` bez walidacji | Load aggregate → `markComplete()` → save |
| Komunikat błędu | „Ukończ najpierw wszystkie ćwiczenia zamknięte." (UI) | Named domain error + HTTP 409 |
| Testy | Skip w `lesson-completion.spec.ts:41-43` | Włączony test + nowe unit testy agregatu |

## 5.2 Plan fazowy

### Faza 1 — Migration + model danych
- Dodać migrację tworzącą `exercise_submissions` z RLS.
- Wygenerować na nowo `src/lib/database.types.ts` (`npm run db:gen-types`).
- **Test:** migracja przechodzi `supabase db reset`.

### Faza 2 — Utrwalanie poprawnych odpowiedzi
- Rozszerzyć `src/pages/api/exercises/verify.ts` o `upsert` do `exercise_submissions` dla poprawnych odpowiedzi zamkniętych.
- **Testy kontraktowe:** `POST /api/exercises/verify` z poprawną odpowiedzią tworzy wiersz w `exercise_submissions`; błędna odpowiedź go nie tworzy.

### Faza 3 — Warstwa domenowa
- Utworzyć `src/domain/lesson-completion.ts` z `LessonCompletion`, `LessonCompletionRepository`, błędami domenowymi.
- Napisać `src/lib/services/lesson-completion.repository.ts` oparty na Supabase.
- **Testy jednostkowe:** `lesson-completion.test.ts` — patrz §5.3.

### Faza 4 — Refactor endpointa ukończenia
- Zamienić `src/pages/api/lessons/[id]/complete.ts` na load → mark → save.
- Mapować domenowe błędy na HTTP 200 (idempotent), 409, 403, 500.
- **Testy integracyjne:** włączyć dotychczas skipowany test oraz dodać nowe.

### Faza 5 — Adaptacja UI
- Zachować UX-owy gating w `LessonInteractive.tsx` (szybka informacja zwrotna), ale usunąć z niego rolę jedynego strażnika.
- UI powinien obsługiwać nowy status 409 (np. wyświetlić powrót do ćwiczeń).

### Faza 6 — CI / regression
- Uruchomić `npm run test:unit` oraz `npx playwright test --project=integration` (wymaga lokalnego Supabase).
- Upewnić się, że `lesson-completion.spec.ts` przechodzi.

## 5.3 Przypadki test-first (legalne i nielegalne)

Plik: `src/domain/lesson-completion.test.ts`

### Operacje legalne

```ts
it("allows completing a reading-only lesson with no closed exercises", () => {
  const completion = new LessonCompletion("user-1", "lesson-1", [], new Set(), false);
  const event = completion.markComplete();
  expect(event.userId).toBe("user-1");
  expect(event.lessonId).toBe("lesson-1");
});

it("allows completing a lesson when all closed exercises are solved", () => {
  const completion = new LessonCompletion(
    "user-1",
    "lesson-1",
    ["ex-1", "ex-2"],
    new Set(["ex-1", "ex-2"]),
    false
  );
  expect(() => completion.markComplete()).not.toThrow();
});

it("allows completing a lesson that has only open-ended exercises", () => {
  // open-ended exercises are excluded from closedExerciseIds
  const completion = new LessonCompletion("user-1", "lesson-1", [], new Set(), false);
  expect(() => completion.markComplete()).not.toThrow();
});
```

### Operacje nielegalne

```ts
it("rejects completion when a closed exercise is not solved", () => {
  const completion = new LessonCompletion(
    "user-1",
    "lesson-1",
    ["ex-1", "ex-2"],
    new Set(["ex-1"]), // ex-2 missing
    false
  );
  expect(() => completion.markComplete()).toThrow(ClosedExercisesNotSolvedError);
});

it("rejects completion when no closed exercise is solved", () => {
  const completion = new LessonCompletion(
    "user-1",
    "lesson-1",
    ["ex-1"],
    new Set(),
    false
  );
  expect(() => completion.markComplete()).toThrow(ClosedExercisesNotSolvedError);
});

it("rejects double completion (non-idempotent at domain level)", () => {
  const completion = new LessonCompletion("user-1", "lesson-1", [], new Set(), true);
  expect(() => completion.markComplete()).toThrow(LessonAlreadyCompletedError);
});
```

### Testy repository / integracyjne

```ts
it("repository throws LessonNotAccessibleError for unknown lesson", async () => {
  // stub Supabase returning no lesson row
});

it("server returns 409 when closed exercise is unsolved", async () => {
  // lesson with one closed exercise, zero submissions → POST /complete → 409
});
```

---

# KROK 6 — ACL (Anti-Corruption Layer)

**Czy bardziej palącym problemem jest wyciekająca zależność niż wybrany inwariant?**

Nie. W projekcie nie występuje zewnętrzny model, który kolidowałby z domeną BET na tyle, by uprawniać do wstawienia ACL jako priorytetu:

- **Supabase Auth / PostgreSQL** to generyczna infrastruktura, nie model domenowy konkurenta.
- **Supabase client SDK** jest już używany przez repozytorium jako narzędzie persystencji; nie jest to „obcy język", który trzeba tłumaczyć.
- **Markdown / marked** to transformacja formatu, nie reguła biznesowa.
- **React / Astro** to warstwa prezentacji, nie domena.

Największym „wyciekiem" jest to, że reguła biznesowa została przeniesiona do klienta (UI). Refaktoryzacja agregatu `LessonCompletion` sama w sobie jest formą **wewnętrznego ACL** — oddziela domenę od frameworka webowego i bazy danych. Dlatego KROK 6 zostaje **pominięty**; priorytet ma inwariant.

---

# Kryterium weryfikacji

Refaktoryzacja zostanie uznana za zakończoną, gdy:

1. `npm run test:unit` przechodzi z nowymi testami agregatu `LessonCompletion`.
2. `tests/integration/lesson-completion.spec.ts` zawiera włączony test `server rejects completion when closed exercises are unsolved` i on przechodzi.
3. Endpoint `POST /api/lessons/{id}/complete` zwraca **409 Conflict** dla żądania ukończenia lekcji z nierozwiązanym zamkniętym ćwiczeniem.
