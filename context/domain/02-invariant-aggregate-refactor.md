---
title: "BET — plan refaktoryzacji agregatu / inwariantu ukończenia lekcji"
created: 2026-07-02
type: refactor-plan
---

# KROK 0 — Odkryj kontekst

Produkt to BET — platforma do nauki języka angielskiego z podręcznikiem, gdzie student przerabia lekcje rozdziałami i dostaje natychmiastowy feedback z ćwiczeń. Stack widoczny w kodzie:

- **Frontend / warstwa prezentacji:** Astro 6.3.1 + React 19.2 + TypeScript 5.9 (`package.json`, `astro.config.mjs`).
- **Backend / API:** Astro `output: "server"`, endpointy w `src/pages/api/**/*.ts`.
- **Baza danych:** PostgreSQL przez Supabase, migracje w `supabase/migrations/`, RLS na wszystkich tabelach danych.
- **Domena:** częściowo wydzielona w `src/lib/services/lesson-completion.ts` i `src/lib/verify-exercise.ts`; brak wyraźnej warstwy domenowej dla ukończenia lekcji.

Logika biznesowa dotycząca ukończenia lekcji jest dziś rozdzielona między UI (`LessonInteractive.tsx`), API (`complete.ts`), serwis agregatu (`lesson-completion.ts`) oraz persystencję (`lesson-completion.repository.ts`, `lesson_progress`, `exercise_submissions`). Nie ma jednego miejsca, które egzekwuje pełny inwariant z FR-015.

# KROK 1 — Identyfikacja inwariantów biznesowych

| ID | Inwariant | Źródło |
|---|---|---|
| I-1 | **Ukończenie lekcji** wymaga jednocześnie: (a) jawnego potwierdzenia przeczytania treści (przycisk „Przeczytano") oraz (b) poprawnego rozwiązania wszystkich ćwiczeń zamkniętych. | `context/foundation/prd.md:96-99`, `context/foundation/prd.md:131-132` |
| I-2 | **Rozdział ukończony** wtedy i tylko wtedy, gdy wszystkie lekcje w rozdziale są ukończone. | `context/foundation/prd.md:100-101`, `supabase/migrations/20260625184555_init.sql:232-252` |
| I-3 | Stan ukończenia lekcji jest **nieodwracalny** — brak UPDATE/DELETE na `lesson_progress`. | `context/foundation/prd.md:133`, `supabase/migrations/20260625184555_init.sql:401-415` |
| I-4 | **Ćwiczenia otwarte** (`open_ended`) nigdy nie blokują ukończenia lekcji. | `context/foundation/prd.md:116`, `src/lib/services/lesson-completion.repository.ts:19-25` |
| I-5 | **Weryfikacja odpowiedzi** zamkniętych jest deterministyczna i opiera się na liście dopuszczalnych wariantów. | `context/foundation/prd.md:111-113`, `src/lib/verify-exercise.ts:28-41` |
| I-6 | **Kolejność treści** w książce/rozdziale/lekcji jest wymuszona przez unikalność `ord` w obrębie rodzica. | `supabase/migrations/20260625184555_init.sql:119-123`, `129-130`, `145-146` |
| I-7 | **Kontrola dostępu:** student widzi tylko książki przypisane przez admina (`user_book_access`). | `context/foundation/prd.md:138`, `supabase/migrations/20260625184555_init.sql:336-352` (obecnie rozluźnione przez `supabase/migrations/20260629000000_open_book_access_for_students.sql:1-10`) |

# KROK 2 — Klasyfikacja i wybór inwariantu #1

| Inwariant | Rdzeniowość dla produktu | Rozproszenie po warstwach | Stan egzekwowania |
|---|---|---|---|
| I-1 | **Krytyczna** — bez niej postęp studenta jest iluzoryczny; wpisana w główne kryterium sukcesu PRD. | UI, API, serwis, repozytorium, baza — **rozproszona**. | **Słabo** — część „Przeczytano" egzekwowana tylko w UI; serwer jej nie sprawdza. |
| I-2 | Wysoka | Baza (widok) + UI | Egzekwowana poprawnie przez widok `chapter_progress`. |
| I-3 | Wysoka | Baza (RLS) | Egzekwowana silno przez brak UPDATE/DELETE. |
| I-4 | Wysoka | Serwis weryfikacji + repozytorium | Egzekwowana — 100% pokrycia testami jednostkowymi. |
| I-5 | Średnia | Baza + serwis | Egzekwowana silno przez `verify-exercise.ts` i `exercise_submissions.is_correct = true` constraint. |
| I-6 | Średnia | Baza (unique) | Egzekwowana przez constrainty DDL. |
| I-7 | Wysoka | RLS + migracja rozluźniająca | Świadomie rozluźniona na potrzeby MVP; nie jest ukrytym wyciekiem. |

**Wybór: I-1 — inwariant ukończenia lekcji (FR-015).**

Uzasadnienie:

1. Jest wpisany w **primary success criterion** produktu: student musi zobaczyć, że lekcja zaliczyła się po wykonaniu ćwiczeń i przeczytaniu treści (`context/foundation/prd.md:35`).
2. Jest jednocześnie **najbardziej rozproszony i najsłabiej egzekwowany**: część dotycząca ćwiczeń zamkniętych jest już w agregacie, ale część dotycząca przeczytania żyje wyłącznie w przycisku UI.
3. Test-plan wskazuje ryzyko #6 jako **High** impact: błędne gating ukończenia lekcji (`context/foundation/test-plan.md:24`).
4. Obecny endpoint `complete.ts` może zostać wywołany bezpośrednio przez dowolnego klienta; serwer nie weryfikuje, czy student w ogóle otworzył treść.

# KROK 3 — Diagnoza wybranego inwariantu

## Gdzie dziś żyje reguła

| Warstwa | Plik / linia | Obecne zachowanie | Uwagi |
|---|---|---|---|
| **UI (jedyny strażnik "Przeczytano")** | `src/components/lesson/LessonInteractive.tsx:42-62` | `handleMarkRead` najpierw sprawdza `completedExercises.size < closedExerciseCount` (linia 47), a dopiero potem wysyła `POST /api/lessons/${lessonId}/complete` (linia 50). | To UI decyduje, że przycisk „Przeczytano" w ogóle można kliknąć. |
| **UI (render)** | `src/components/lesson/LessonInteractive.tsx:150-167` | Przycisk „Przeczytano" jest disabled dopóki nie rozwiązano wszystkich zamkniętych ćwiczeń; po kliknięciu pokazuje się badge „Ukończona". | Cała semantyka akcji „Przeczytano" znajduje się po stronie klienta. |
| **API / route** | `src/pages/api/lessons/[id]/complete.ts:47-49` | Ładuje agregat, wywołuje `markComplete()`, zapisuje wynik. | Nie odbiera ani nie weryfikuje flagi przeczytania. |
| **Agregat / domena** | `src/lib/services/lesson-completion.ts:20-34` | `markComplete()` sprawdza `isAlreadyCompleted` oraz nierozwiązane zamknięte ćwiczenia. | Brak parametru / stanu „Przeczytano". |
| **Repozytorium** | `src/lib/services/lesson-completion.repository.ts:12-67` | Ładuje lekcję, ćwiczenia zamknięte, poprawne submissions i istniejący `lesson_progress`. | Nie ładuje żadnej informacji o potwierdzeniu przeczytania. |
| **Baza danych** | `supabase/migrations/20260625184555_init.sql:132-140` | Tabela `lesson_progress` przechowuje tylko `completed_at`. | Brak tabeli/kolumny rejestrującej akcję „Przeczytano". |
| **Weryfikacja submissions** | `src/pages/api/exercises/verify.ts:50-62` | Po poprawnej odpowiedzi zamkniętego ćwiczenia zapisuje wiersz w `exercise_submissions` przez service-role client. | To już działa i wspiera agregat; nie dotyczy czytania. |

## Gdzie inwariant wycieka

1. **Serwer nie egzekwuje części „Przeczytano".** `complete.ts:47-49` traktuje każde żądanie POST jako równoważne z kliknięciem przycisku, ale nie zapisuje ani nie sprawdza tego faktu.
2. **Agregat `LessonCompletion` nie posiada pojęcia „Przeczytano".** `lesson-completion.ts:20-34` waliduje tylko `isAlreadyCompleted` i `unsolved`.
3. **Repozytorium nie ładuje stanu czytania.** `lesson-completion.repository.ts:12-67` wykonuje 4 zapytania, żadne nie dotyczy `reading_confirmed`.
4. **Baza nie ma encji dla potwierdzenia czytania.** `lesson_progress` ma tylko `completed_at`; nie ma triggera / constraintu, który łączyłby czytanie z ukończeniem.
5. **UI jest jedynym strażnikiem.** Zmodyfikowany klient lub bezpośrednie wywołanie `POST /api/lessons/{id}/complete` pomija całkowicie wymóg kliknięcia „Przeczytano".

# KROK 4 — Projekt agregatu-strażnika

## 4.1 Nowy agregat: `StudentLessonProgress`

Zastępujemy / rozszerzamy obecny `LessonCompletion` o jawny stan potwierdzenia przeczytania. Agregat staje się jedynym miejscem decyzji o ukończeniu.

```ts
// src/lib/domain/student-lesson-progress.ts
export interface LessonCompletionResult {
  user_id: string;
  lesson_id: string;
  completed_at: Date;
}

export class StudentLessonProgress {
  constructor(
    private readonly userId: string,
    private readonly lessonId: string,
    private readonly closedExerciseIds: string[],
    private readonly solvedExerciseIds: Set<string>,
    private readonly readingConfirmed: boolean,
    private readonly isAlreadyCompleted: boolean,
    private readonly isAccessible: boolean,
  ) {}

  confirmReading(): StudentLessonProgress {
    this.guardAccessAndNotCompleted();
    return new StudentLessonProgress(
      this.userId,
      this.lessonId,
      this.closedExerciseIds,
      this.solvedExerciseIds,
      true,
      this.isAlreadyCompleted,
      this.isAccessible,
    );
  }

  recordClosedExerciseSolved(exerciseId: string): StudentLessonProgress {
    this.guardAccessAndNotCompleted();
    if (!this.closedExerciseIds.includes(exerciseId)) {
      throw new ExerciseNotPartOfLessonError(this.lessonId, exerciseId);
    }
    const next = new Set(this.solvedExerciseIds);
    next.add(exerciseId);
    return new StudentLessonProgress(
      this.userId,
      this.lessonId,
      this.closedExerciseIds,
      next,
      this.readingConfirmed,
      this.isAlreadyCompleted,
      this.isAccessible,
    );
  }

  complete(): LessonCompletionResult {
    this.guardAccessAndNotCompleted();

    if (!this.readingConfirmed) {
      throw new ReadingNotConfirmedError(this.lessonId);
    }

    const unsolved = this.closedExerciseIds.filter((id) => !this.solvedExerciseIds.has(id));
    if (unsolved.length > 0) {
      throw new ClosedExercisesNotSolvedError(unsolved);
    }

    return {
      user_id: this.userId,
      lesson_id: this.lessonId,
      completed_at: new Date(),
    };
  }

  private guardAccessAndNotCompleted(): void {
    if (!this.isAccessible) {
      throw new LessonNotAccessibleError(this.lessonId);
    }
    if (this.isAlreadyCompleted) {
      throw new LessonAlreadyCompletedError(this.lessonId);
    }
  }
}
```

## 4.2 Nazwane błędy domenowe

```ts
// src/lib/errors/student-lesson-progress.ts
export class StudentLessonProgressError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StudentLessonProgressError";
  }
}

export class LessonNotAccessibleError extends StudentLessonProgressError {
  constructor(public readonly lessonId: string) {
    super(`Lesson ${lessonId} is not accessible`);
    this.name = "LessonNotAccessibleError";
  }
}

export class LessonAlreadyCompletedError extends StudentLessonProgressError {
  constructor(public readonly lessonId: string) {
    super(`Lesson ${lessonId} is already completed`);
    this.name = "LessonAlreadyCompletedError";
  }
}

export class ReadingNotConfirmedError extends StudentLessonProgressError {
  constructor(public readonly lessonId: string) {
    super(`Reading has not been confirmed for lesson ${lessonId}`);
    this.name = "ReadingNotConfirmedError";
  }
}

export class ClosedExercisesNotSolvedError extends StudentLessonProgressError {
  readonly unsolvedExerciseIds: string[];
  constructor(unsolvedExerciseIds: string[]) {
    super(`Closed exercises not solved: ${unsolvedExerciseIds.join(", ")}`);
    this.name = "ClosedExercisesNotSolvedError";
    this.unsolvedExerciseIds = unsolvedExerciseIds;
  }
}

export class ExerciseNotPartOfLessonError extends StudentLessonProgressError {
  constructor(
    public readonly lessonId: string,
    public readonly exerciseId: string,
  ) {
    super(`Exercise ${exerciseId} is not part of lesson ${lessonId}`);
    this.name = "ExerciseNotPartOfLessonError";
  }
}
```

## 4.3 Nowa tabela i funkcja atomowa

Migracja dodaje tabelę potwierdzeń czytania oraz atomową funkcję ukończenia lekcji, żeby inwariant był egzekwowany w jednej transakcji bazy danych.

```sql
-- supabase/migrations/20260702_add_reading_confirmation_and_atomic_completion.sql

-- 1. Potwierdzenie przeczytania treści (jawna akcja studenta)
create table public.lesson_reading_confirmations (
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  confirmed_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

create index lesson_reading_confirmations_lesson_id_idx
  on public.lesson_reading_confirmations(lesson_id);

alter table public.lesson_reading_confirmations enable row level security;

create policy lesson_reading_confirmations_select on public.lesson_reading_confirmations
  for select to authenticated using (user_id = (select auth.uid()) or (select private.is_admin()));

create policy lesson_reading_confirmations_insert on public.lesson_reading_confirmations
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and (select private.has_lesson_access(lesson_id))
  );

-- 2. Atomowa funkcja ukończenia lekcji — źródło prawdy dla inwariantu.
-- Zwraca TRUE gdy ukończono, FALSE gdy już ukończona; rzuca wyjątek przy naruszeniu warunków.
create or replace function private.complete_lesson(p_user_id uuid, p_lesson_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_accessible boolean;
  v_reading_confirmed boolean;
  v_lesson_completed boolean;
  v_unsolved_count int;
begin
  -- dostępność
  select private.has_lesson_access(p_lesson_id) into v_accessible;
  if not v_accessible then
    raise exception 'LessonNotAccessible: %', p_lesson_id;
  end if;

  -- nieodwracalność (idempotentność)
  select exists (
    select 1 from public.lesson_progress
    where user_id = p_user_id and lesson_id = p_lesson_id
  ) into v_lesson_completed;
  if v_lesson_completed then
    return false;
  end if;

  -- potwierdzenie czytania
  select exists (
    select 1 from public.lesson_reading_confirmations
    where user_id = p_user_id and lesson_id = p_lesson_id
  ) into v_reading_confirmed;
  if not v_reading_confirmed then
    raise exception 'ReadingNotConfirmed: %', p_lesson_id;
  end if;

  -- wszystkie zamknięte ćwiczenia rozwiązane
  select count(*) into v_unsolved_count
  from public.exercises e
  where e.lesson_id = p_lesson_id
    and e.type <> 'open_ended'
    and not exists (
      select 1 from public.exercise_submissions s
      where s.user_id = p_user_id
        and s.exercise_id = e.id
        and s.is_correct = true
    );

  if v_unsolved_count > 0 then
    raise exception 'ClosedExercisesNotSolved: %', p_lesson_id;
  end if;

  -- atomowy zapis ukończenia
  insert into public.lesson_progress (user_id, lesson_id, completed_at)
  values (p_user_id, p_lesson_id, now());

  return true;
end;
$$;
```

## 4.4 Repozytorium

Repozytorium ładuje agregat zamiast rozsianych zapytań i deleguje atomowy zapis do funkcji `private.complete_lesson`. Funkcja ta jest transakcyjnym źródłem prawdy, więc nawet dwa równoległe żądania nie przebiją inwariantu.

```ts
// src/lib/services/student-lesson-progress.repository.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import {
  LessonNotAccessibleError,
  ReadingNotConfirmedError,
  ClosedExercisesNotSolvedError,
  LessonAlreadyCompletedError,
} from "@/lib/errors/student-lesson-progress";
import { StudentLessonProgress } from "@/lib/domain/student-lesson-progress";

type Supabase = SupabaseClient<Database>;

const CLOSED_TYPES = new Set([
  "multiple_choice",
  "fill_in_blank",
  "true_false",
  "sentence_transformation",
  "matching",
]);

export async function loadStudentLessonProgress(
  supabase: Supabase,
  userId: string,
  lessonId: string,
): Promise<StudentLessonProgress> {
  const { data: lesson, error: lessonError } = await supabase
    .from("lessons")
    .select("id")
    .eq("id", lessonId)
    .maybeSingle();

  if (lessonError || !lesson) {
    throw new LessonNotAccessibleError(lessonId);
  }

  const { data: exercises, error: exercisesError } = await supabase
    .from("exercises")
    .select("id, type")
    .eq("lesson_id", lessonId);

  if (exercisesError) {
    throw new LessonNotAccessibleError(lessonId);
  }

  const closedExerciseIds = (exercises ?? [])
    .filter((e) => CLOSED_TYPES.has(e.type))
    .map((e) => e.id);

  let solvedExerciseIds = new Set<string>();
  if (closedExerciseIds.length > 0) {
    const { data: submissions, error: submissionsError } = await supabase
      .from("exercise_submissions")
      .select("exercise_id")
      .eq("user_id", userId)
      .in("exercise_id", closedExerciseIds);

    if (submissionsError) {
      throw new LessonNotAccessibleError(lessonId);
    }

    solvedExerciseIds = new Set(submissions?.map((s) => s.exercise_id) ?? []);
  }

  const [{ data: readingRow }, { data: progressRow }] = await Promise.all([
    supabase
      .from("lesson_reading_confirmations")
      .select("lesson_id")
      .eq("user_id", userId)
      .eq("lesson_id", lessonId)
      .maybeSingle(),
    supabase
      .from("lesson_progress")
      .select("lesson_id")
      .eq("user_id", userId)
      .eq("lesson_id", lessonId)
      .maybeSingle(),
  ]);

  return new StudentLessonProgress(
    lessonId,
    userId,
    closedExerciseIds,
    solvedExerciseIds,
    readingRow !== null,
    progressRow !== null,
    true,
  );
}

export async function saveLessonCompletion(
  supabase: Supabase,
  userId: string,
  lessonId: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("complete_lesson", {
    p_user_id: userId,
    p_lesson_id: lessonId,
  });

  if (error) {
    if (error.message.startsWith("LessonNotAccessible")) {
      throw new LessonNotAccessibleError(lessonId);
    }
    if (error.message.startsWith("ReadingNotConfirmed")) {
      throw new ReadingNotConfirmedError(lessonId);
    }
    if (error.message.startsWith("ClosedExercisesNotSolved")) {
      throw new ClosedExercisesNotSolvedError([]);
    }
    throw error;
  }

  return data === true;
}
```

## 4.5 Cienkie API / route

Route robi wyłącznie: autentykacja, walidacja UUID, wywołanie metody agregatu, mapowanie nazwanego błędu na odpowiedź HTTP. Cała logika biznesowa zostaje w domenie.

```ts
// src/pages/api/lessons/[id]/complete.ts (po refaktoryzacji)
import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase.server";
import { uuidSchema } from "@/lib/utils";
import type { Database } from "@/lib/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ClosedExercisesNotSolvedError,
  LessonAlreadyCompletedError,
  LessonNotAccessibleError,
  ReadingNotConfirmedError,
} from "@/lib/errors/student-lesson-progress";
import {
  loadStudentLessonProgress,
  saveLessonCompletion,
} from "@/lib/services/student-lesson-progress.repository";

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies) as SupabaseClient<Database> | null;
  if (!supabase) {
    return Response.json({ error: "Service unavailable" }, { status: 503 });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const lessonId = context.params.id;
  const parsed = uuidSchema.safeParse(lessonId);
  if (!parsed.success) {
    return Response.json({ error: "Invalid lesson ID" }, { status: 400 });
  }
  const validLessonId = parsed.data;

  try {
    const aggregate = await loadStudentLessonProgress(supabase, user.id, validLessonId);
    aggregate.complete();
    await saveLessonCompletion(supabase, user.id, validLessonId);
  } catch (error) {
    if (error instanceof LessonAlreadyCompletedError) {
      return Response.json({ success: true }, { status: 200 });
    }
    if (error instanceof ReadingNotConfirmedError) {
      return Response.json(
        { error: "Potwierdź przeczytanie lekcji." },
        { status: 409 },
      );
    }
    if (error instanceof ClosedExercisesNotSolvedError) {
      return Response.json(
        { error: "Nie rozwiązano wszystkich ćwiczeń zamkniętych." },
        { status: 409 },
      );
    }
    if (error instanceof LessonNotAccessibleError) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    return Response.json({ error: "Failed to record lesson completion" }, { status: 500 });
  }

  return Response.json({ success: true }, { status: 200 });
};
```

Dodatkowo należy wprowadzić osobny endpoint `POST /api/lessons/[id]/read`, który wywołuje `aggregate.confirmReading()` i zapisuje wiersz w `lesson_reading_confirmations`. Dzięki temu student może potwierdzić czytanie przed rozwiązaniem ostatniego ćwiczenia, a ukończenie zostanie wywołane osobno.

## 4.6 Cienkie mapowanie w UI

Komponent przestaje być strażnikiem inwariantu i staje się cienką warstwą wywołującą domenę:

```ts
// src/components/lesson/LessonInteractive.tsx (fragment po refaktoryzacji)
async function handleMarkRead() {
  setCompleting(true);
  setErrorMessage(null);

  try {
    // 1. Potwierdź przeczytanie (idempotentne)
    const readRes = await fetch(`/api/lessons/${lessonId}/read`, { method: "POST" });
    if (!readRes.ok) {
      const data = (await readRes.json().catch(() => ({}))) as { error?: string };
      setErrorMessage(data.error ?? `Błąd: ${readRes.status}`);
      return;
    }

    // 2. Spróbuj ukończyć lekcję
    const completeRes = await fetch(`/api/lessons/${lessonId}/complete`, { method: "POST" });
    if (completeRes.ok) {
      setIsCompleted(true);
    } else {
      const data = (await completeRes.json().catch(() => ({}))) as { error?: string };
      setErrorMessage(data.error ?? `Błąd zapisu: ${completeRes.status}`);
    }
  } catch (err) {
    setErrorMessage(err instanceof Error ? err.message : "Błąd sieci");
  } finally {
    setCompleting(false);
  }
}
```

Przycisk może pozostać disabled do czasu rozwiązania wszystkich zamkniętych ćwiczeń (UX), ale decyzja o ukończeniu należy teraz do serwera.

# KROK 5 — Before/after, plan fazowy i testy

## 5.1 Before / after

| Miejsce | Before (dzisiaj) | After (po refaktoryzacji) |
|---|---|---|
| `src/components/lesson/LessonInteractive.tsx:42-62` | UI jest jedynym strażnikiem „Przeczytano"; przycisk blokuje kliknięcie, ale serwer nie wie o akcji. | UI wysyła `POST /read`, a potem `POST /complete`; decyzja należy do agregatu. |
| `src/pages/api/lessons/[id]/complete.ts:47-49` | Endpoint ignoruje czytanie i zapisuje ukończenie na podstawie samego agregatu `LessonCompletion`. | Endpoint używa `StudentLessonProgress.complete()` i atomowej funkcji `private.complete_lesson`. |
| `src/lib/services/lesson-completion.ts:20-34` | `markComplete()` waliduje tylko `isAlreadyCompleted` i `unsolved`. | `complete()` dodatkowo wymaga `readingConfirmed === true`. |
| `src/lib/services/lesson-completion.repository.ts:12-67` | Ładuje ćwiczenia, submissions i progress; nie ma stanu czytania. | Ładuje również `lesson_reading_confirmations`; zapisuje przez `complete_lesson` RPC. |
| `supabase/migrations/20260625184555_init.sql:132-140` | `lesson_progress` ma tylko `completed_at`. | Pojawia się tabela `lesson_reading_confirmations` i funkcja `private.complete_lesson`. |
| `tests/integration/lesson-completion.spec.ts:33-87` | Testy zakładają, że `POST /complete` wystarczy do ukończenia. | Testy pokrywają brak potwierdzenia czytania, brak rozwiązanych ćwiczeń i idempotentność. |

## 5.2 Plan faz refaktoru

| Faza | Zakres | Test-first? | Uwagi |
|---|---|---|---|
| 1 | Migracja: `lesson_reading_confirmations` + `private.complete_lesson`. | Tak — testy SQL/contract dla funkcji atomowej. | Funkcja staje się źródłem prawdy w bazie; można ją wdrożyć niezależnie od API. |
| 2 | Domena: `StudentLessonProgress` + nowe błędy w `src/lib/domain/` i `src/lib/errors/`. | Tak — testy jednostkowe agregatu. | Obecny `LessonCompletion` może zostać zastąpiony; istniejące testy w `lesson-completion.test.ts` przenosimy i rozszerzamy. |
| 3 | Repozytorium: `loadStudentLessonProgress` / `saveLessonCompletion` używające `complete_lesson` RPC. | Tak — testy integracyjne z lokalną Supabase. | Usuwamy stary `lesson-completion.repository.ts` po migracji callerów. |
| 4 | API: nowy `POST /api/lessons/[id]/read` i zmiana `complete.ts` na mapowanie błędów. | Tak — testy API contract. | Cienkie route'y, zero logiki biznesowej. |
| 5 | UI: `LessonInteractive.tsx` wywołuje `/read` a potem `/complete`. | Nie — zmiana UX, ale reguła jest już egzekwowana serwerowo. | Zostawiamy disabled button dla nierozwiązanych ćwiczeń z wyglądu, nie z bezpieczeństwa. |
| 6 | Testy e2e: aktualizacja `lesson-completion-persistence.spec.ts` i `closed-exercises.spec.ts`. | Nie — weryfikacja końcowa. | Potwierdzenie, że przycisk „Przeczytano" nadal działa end-to-end. |

## 5.3 Przypadki testowe dla inwariantu

| # | Scenariusz | Oczekiwany wynik |
|---|---|---|
| T-1 | Lekcja tylko do czytania; potwierdzono czytanie; wywołano `complete()`. | `200`, wiersz w `lesson_progress`. |
| T-2 | Wszystkie zamknięte ćwiczenia rozwiązane i czytanie potwierdzone; `complete()`. | `200`, wiersz w `lesson_progress`. |
| T-3 | Wszystkie zamknięte rozwiązane, **brak** potwierdzenia czytania; `complete()`. | `409 ReadingNotConfirmedError`, brak wiersza w `lesson_progress`. |
| T-4 | Czytanie potwierdzone, jedno zamknięte ćwiczenie nierozwiązane; `complete()`. | `409 ClosedExercisesNotSolvedError`, lista nierozwiązanych ID. |
| T-5 | Lekcja już ukończona; ponowne `complete()`. | `200` idempotentne. |
| T-6 | Użytkownik bez dostępu do lekcji; `complete()`. | `403 LessonNotAccessibleError`. |
| T-7 | Ćwiczenie otwarte nie wpływa na gating; potwierdzono czytanie i rozwiązano zamknięte. | `200`, `open_ended` ignorowane. |
| T-8 | Dwa równoległe `complete()` dla tej samej lekcji. | Jeden `200`, drugi `200` idempotentne; tylko jeden wiersz `lesson_progress`. |
| T-9 | `confirmReading()` na lekcji bez dostępu. | `403 LessonNotAccessibleError`. |
| T-10 | `recordClosedExerciseSolved()` z ID ćwiczenia spoza lekcji. | `ExerciseNotPartOfLessonError`. |

## 5.4 Nowe nazwy „load-bearing" do rejestru kontraktów

Jeśli projekt prowadzi rejestr kontraktów (np. w `context/foundation/contracts.md` lub w testach kontraktowych), należy zarejestrować:

- `StudentLessonProgress` — agregat root.
- `StudentLessonProgress.complete()` — operacja ukończenia lekcji.
- `StudentLessonProgress.confirmReading()` — operacja potwierdzenia czytania.
- `ReadingNotConfirmedError` — nowy nazwany błąd domenowy.
- `ExerciseNotPartOfLessonError` — nowy nazwany błąd domenowy.
- `private.complete_lesson(p_user_id, p_lesson_id)` — atomowa funkcja bazy danych.
- `public.lesson_reading_confirmations` — nowa tabela persystencji.
- `POST /api/lessons/[id]/read` — nowy endpoint API.
- `POST /api/lessons/[id]/complete` — zaktualizowany kontrakt (dodatkowy warunek wstępny).

---

# Podsumowanie

Inwariant ukończenia lekcji (FR-015) jest dziś najbardziej rdzeniowym i najsłabiej egzekwowanym: część dotycząca „Przeczytano" żyje wyłącznie w UI, podczas gdy serwerowy endpoint `complete.ts` może oznaczyć lekcję jako ukończoną bez żadnego śladu przeczytania. Plan przenosi całą odpowiedzialność do agregatu `StudentLessonProgress`, który wymaga zarówno potwierdzenia czytania, jak i rozwiązania wszystkich ćwiczeń zamkniętych. Persystencja opiera się na nowej tabeli `lesson_reading_confirmations` i atomowej funkcji `private.complete_lesson`, co zapobiega wyścigom i fałszerstwom postępu. Route'y Astro pozostają cienkie, a UI staje się tylko wywołującym warstwą, nie strażnikiem. Refaktoryzację należy przeprowadzić fazowo, od migracji i domeny test-first, przez repozytorium i API, aż po aktualizację testów e2e.

