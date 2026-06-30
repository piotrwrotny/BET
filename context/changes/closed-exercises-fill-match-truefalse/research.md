---
date: 2026-06-29T14:00:00+02:00
researcher: AI
git_commit: 5d57a1d2e1561df16bb03059b51809abbbb4beee
branch: dev
repository: BET
topic: "S-06: closed-exercises-fill-match-truefalse — exercise engine extension research"
tags: [research, exercises, closed-types, fill-in-blank, matching, true-false, admin, student, verify]
status: complete
last_updated: 2026-06-29
last_updated_by: AI
---

# Research: S-06 — Closed exercise types (fill-in-blank, matching, true/false)

## Research question

What is the current shape of the exercise engine, and what changes are needed to support fill-in-the-blank, matching, and true/false exercises end-to-end (admin creation, student rendering, answer verification, lesson completion)?

## Summary

- **DB schema already supports all six exercise types.** `exercise_type` enum includes `multiple_choice`, `fill_in_blank`, `matching`, `true_false`, `sentence_transformation`, `open_ended` (`src/lib/database.types.ts:305-310`, `:443-449`; `supabase/migrations/20260625184555_init.sql:34-40`). `exercises.payload` is generic `jsonb` intended for type-specific structure (`supabase/migrations/20260625184555_init.sql:106-108`), and `exercise_keys` stores acceptable answer variants with optional `key_metadata` (`src/lib/database.types.ts:96-125`; `supabase/migrations/20260625184555_init.sql:120-130`).
- **Admin `ExerciseForm.tsx` only knows three types:** `multiple_choice`, `fill_in_blank`, `true_false`. MC stores options in `payload.options`; FIB and T/F use an empty payload `{}`. Keys are always sent to the API as a flat `string[]`.
- **Admin CRUD APIs validate the same three-type enum**, auto-append `ord`, enforce the MC key-in-options rule, and replace all keys on update with a simple backup/restore strategy.
- **Student rendering only handles MC.** `LessonInteractive.tsx` renders every other type as a placeholder card. `lessons/[id].astro` currently counts only `multiple_choice` toward `closedExerciseCount`, which is a known drift from FR-015 flagged in the S-01 implementation review (F2).
- **Answer verification is type-agnostic for single-string answers.** It normalizes one `answer` string and compares it against all non-reference `key_text` values. This already works for FIB and T/F, but matching will need a structured answer shape and comparison logic.
- **Matching is declared in the enum** and the migration explicitly mentions “pairs for matching” in payload, yet there is no UI, renderer, payload schema, or key convention for it.

## Detailed findings

### 1. DB schema and types

- `src/lib/database.types.ts:305-310` and `:443-449` define:
  ```ts
  exercise_type:
    | "multiple_choice"
    | "fill_in_blank"
    | "matching"
    | "true_false"
    | "sentence_transformation"
    | "open_ended"
  ```
- `exercises` table (`src/lib/database.types.ts:128-155`): `id`, `lesson_id`, `type`, `prompt`, `payload: Json`, `ord`.
- `exercise_keys` table (`src/lib/database.types.ts:96-125`): `exercise_id`, `key_text`, `key_metadata: Json | null`, `ord`.
- Migration enum creation: `supabase/migrations/20260625184555_init.sql:34-40`.
- Migration comment on payload shape: `supabase/migrations/20260625184555_init.sql:106-108`:
  > “`payload` holds the type-specific structure (options for MC, blanks for fill-in, pairs for matching, etc). App-side Zod schema enforces shape per type.”
- Migration comment on `key_metadata`: `supabase/migrations/20260625184555_init.sql:120-122`:
  > “`key_metadata` is optional structured info (e.g., matching pair sides, `is_reference_only` flag for open-ended model answers).”

### 2. Admin exercise form

- `src/components/admin/ExerciseForm.tsx:3` hardcodes:
  ```ts
  type ExerciseType = "multiple_choice" | "fill_in_blank" | "true_false";
  ```
  `matching` is absent.
- Props surface `initialType`, `initialPrompt`, `initialOptions`, `initialKeys` (`src/components/admin/ExerciseForm.tsx:5-12`). The edit page casts DB type to the three-type union (`src/pages/admin/exercises/[id]/edit.astro:68`).
- State is split by type: `options`/`correctOption` for MC, `fibKeys` for FIB, `tfKey` for T/F.
- Validation (`src/components/admin/ExerciseForm.tsx:45-56`):
  - prompt required;
  - MC needs ≥2 non-empty options and a selected correct option that is one of them;
  - FIB needs ≥1 non-empty key;
  - T/F has no extra validation (it always has a selected value).
- Payload/key construction on submit (`src/components/admin/ExerciseForm.tsx:71-79`):
  - MC: `payload = { options: options.filter(o => o.trim()) }`, `keys = [correctOption]`;
  - FIB: `payload = {}`, `keys = fibKeys.filter(k => k.trim())`;
  - T/F: `payload = {}`, `keys = [tfKey]` (`"true"` or `"false"`).
- UI labels:
  - FIB prompt hint: `Użyj _____ jako oznaczenia luki` (`src/components/admin/ExerciseForm.tsx:147-149`);
  - FIB accepts multiple acceptable variants (`src/components/admin/ExerciseForm.tsx:218-220`);
  - T/F radio buttons: Prawda / Fałsz (`src/components/admin/ExerciseForm.tsx:258-272`).

### 3. Admin exercise CRUD API

`src/pages/api/admin/exercises/index.ts`:
- `ExerciseTypeEnum` and `CreateExerciseSchema` accept only the same three types (`index.ts:7-14`). `payload` is `z.record(z.string(), z.unknown())`, `keys` is `z.array(z.string().min(1)).min(1)`.
- MC cross-validation (`index.ts:51-55`): rejects if `keys[0]` is not in `payload.options`.
- `ord` auto-increment (`index.ts:58-71`): `SELECT ... ORDER BY ord DESC LIMIT 1`, then `ord + 1` (or 0).
- Keys are inserted in order (`index.ts:79-80`).

`src/pages/api/admin/exercises/[id].ts`:
- Uses an identical `UpdateExerciseSchema` (`[id].ts:10-14`).
- Update flow: validate, update exercise row, read old keys, delete old keys, insert new keys, restore old keys on insert failure (`[id].ts:66-100`).
- `DELETE` simply deletes the exercise; cascade deletes its keys (`[id].ts:124-144`).

### 4. Student exercise rendering

`src/components/lesson/LessonInteractive.tsx`:
- Dispatcher at `LessonInteractive.tsx:58-84`:
  - MC → `MultipleChoiceExercise`;
  - everything else → placeholder card with text `[{ex.type}] — interaktywność dostępna wkrótce.`
- Completion gate uses `closedExerciseCount` (`LessonInteractive.tsx:36`); no other rendering logic needs to change once the count and dispatcher are fixed.

`src/components/lesson/MultipleChoiceExercise.tsx`:
- Expects `payload: { options: string[] }` (`MultipleChoiceExercise.tsx:3-8`).
- Submits `{ exercise_id, answer: selectedOption }` to `/api/exercises/verify` (`MultipleChoiceExercise.tsx:31-34`).
- Locks component and calls `onCorrect(exerciseId)` after a correct response (`MultipleChoiceExercise.tsx:42-44`).

`src/pages/lessons/[id].astro`:
- Queries lesson + nested exercises (`lessons/[id].astro:43-54`), sorts by `ord`.
- Computes `closedExerciseCount` as `exercises.filter((e) => e.type === "multiple_choice").length` (`lessons/[id].astro:59`). The inline comment says other closed types are unblocked until S-06/S-07.
- Fetches correct answers only for MC when `isAlreadyCompleted` (`lessons/[id].astro:73-83`), populating `correctAnswers: Record<string, string>`.
- Passes data to `<LessonInteractive client:load ... />` (`lessons/[id].astro:257-260`).

### 5. Answer verification

`src/pages/api/exercises/verify.ts`:
- Body schema (`verify.ts:6-9`):
  ```ts
  { exercise_id: uuidSchema, answer: z.string().min(1) }
  ```
- Fetches `exercise_keys` RLS-filtered (`verify.ts:38-47`); keys never reach the client before completion.
- Normalizes incoming answer with `answer.trim().toLowerCase()` (`verify.ts:52`).
- Skips `is_reference_only` entries (`verify.ts:55-57`) and performs exact normalized string match (`verify.ts:57`).
- This works for any closed type whose answer is a single string (MC, FIB, T/F). Matching will need a new branch because its answer must be a structured mapping.

### 6. `closedExerciseCount` / lesson completion filtering

- Current filter in `src/pages/lessons/[id].astro:59`:
  ```ts
  const closedExerciseCount = exercises.filter((e) => e.type === "multiple_choice").length;
  ```
- Expected per FR-015 / PRD: all types except `open_ended` are closed. The S-01 implementation review (`context/archive/2026-06-25-first-lesson-end-to-end/reviews/impl-review.md:59-66`, F2) explicitly recommends:
  ```ts
  exercises.filter((e) => e.type !== "open_ended").length
  ```
- Until this is fixed, any lesson containing FIB, T/F, or matching (and no MC) will allow completion without solving anything.

### 7. Placeholders / TODOs for unsupported types

- `src/components/lesson/LessonInteractive.tsx:76-83` placeholder card for any non-MC type.
- `src/pages/lessons/[id].astro:58` comment: “S-01: only multiple_choice is interactive; other closed types unblocked until S-06/S-07”.
- Seed data: the data-foundation plan intended lesson_2_1 to be `true_false`, but the current seed stores it as `multiple_choice` with options `["True", "False"]` (`supabase/seed.sql:201-207`; key `'true'` at `seed.sql:237-238`). There is no `fill_in_blank` exercise in the current seed.
- Admin list page labels all six enum values (`src/pages/admin/exercises/index.astro:56-62`), but the edit form casts unsupported types to MC/FIB/T-F and will misrender them.

### 8. Relevant archived research / plans

`context/archive/2026-06-26-admin-content-creation/research.md`:
- Established that `exercise_type` enum has 6 values, `payload` is app-defined per type, and `exercise_keys` stores variants with `key_metadata` for matching sides / reference-only flags.
- Recommended ord auto-increment, Zod per-type payload validation, and an admin layout pattern.

`context/archive/2026-06-26-admin-content-creation/plan.md`:
- Admin CRUD pattern: React island for `ExerciseForm`, POST/fetch to JSON API, replace-all keys on update.
- Explicitly scoped S-02 to MC + FIB + T/F; left `matching`, `sentence_transformation`, `open_ended` for S-06/S-07.

`context/archive/2026-06-25-first-lesson-end-to-end/plan.md`:
- Verification contract: keys never reach the client; server compares against `exercise_keys`.
- Lesson completion rule (FR-015): all closed exercises answered correctly; `closedExerciseCount = count where type != 'open_ended'`.
- Placeholder pattern for non-MC types in `LessonInteractive`.

`context/archive/2026-06-25-first-lesson-end-to-end/reviews/impl-review.md` (F2):
- Flags the `closedExerciseCount` drift and prescribes the `type !== "open_ended"` fix.

## Architectural conclusions

1. **Payload as a discriminated union.** Keep `exercises.payload` as `jsonb` but enforce per-type Zod schemas in admin APIs and student components. Proposed shapes:
   - `multiple_choice`: `{ options: string[] }` (existing).
   - `fill_in_blank`: `{}` is sufficient if the prompt encodes blanks with `_____`; alternatively `{ template: string, blanks?: number }` if multi-blank support is desired.
   - `true_false`: `{}` (prompt is the statement).
   - `matching`: new shape needed, e.g. `{ pairs: [{ left: string, right: string }] }`.

2. **Key format.**
   - FIB: multiple `key_text` variants, all acceptable for the single blank (already supported by `verify.ts`).
   - T/F: single key `"true"` or `"false"` (admin already emits this).
   - Matching: cannot rely only on `key_text`. The cleanest options are:
     - Store the full correct mapping as a single JSON string in `key_text` (or in `key_metadata`) and compare submitted mapping objects.
     - Use multiple `exercise_keys` rows, each encoding one correct pair in `key_text` or `key_metadata`, and verify that every submitted pair is present and complete.
   - Recommendation: encode the canonical answer map in one row (either `key_text` JSON or `key_metadata`) to keep verification O(1) and avoid partial-match ambiguity.

3. **Extending `ExerciseForm.tsx`.**
   - The component already uses conditional UI blocks per type. The simplest path is to add a `matching` branch inside the same form rather than build separate sub-forms, because submission orchestration, error handling, and redirect are identical.
   - Keep the matching editor markup isolated (inline or a small local component) because it is substantially different (pair list with add/remove).
   - Update `ExerciseType` union and the API `ExerciseTypeEnum` to include `matching`.

4. **Extending `verify.ts`.**
   - FIB and T/F require no change beyond the existing normalization.
   - Add a guarded `if (exercise.type === "matching")` branch that parses the structured answer, loads payload pairs and the correct key map, and verifies equality.
   - Decide the answer schema now:
     - Option A: keep `answer: z.string()` and JSON-stringify matching maps from the client.
     - Option B: widen to a discriminated union per type. Option B is cleaner but requires updating existing MC/FIB/T-F callers; Option A keeps the API contract unchanged.

5. **Extending `LessonInteractive.tsx`.**
   - Replace the single MC `if` with a dispatcher (switch or object map) and add components `FillInBlankExercise`, `TrueFalseExercise`, `MatchingExercise`.
   - Each component receives the same props as `MultipleChoiceExercise` (`exercise`, `onCorrect`, `disabled`, `initialCorrectAnswer`) and calls `onCorrect` after a correct server response.
   - No change to the “Mark read” flow is needed once `closedExerciseCount` is fixed.

6. **`closedExerciseCount` must be fixed.**
   - Change `src/pages/lessons/[id].astro:59` to `exercises.filter((e) => e.type !== "open_ended").length`.
   - Generalize the `correctAnswers` fetch so completed FIB/T-F/Matching exercises can also show the correct answer in review mode.

7. **Review-mode correct answers.**
   - `correctAnswers: Record<string, string>` works for single-string answers (MC, FIB, T/F).
   - Matching may need a parallel structure (e.g., `Record<string, string>` where the value is a JSON-encoded map) or an extended prop type.

## Open questions

1. **Matching payload and key format.** What exact shape should `payload.pairs` take? Should pairs have stable IDs or just left/right text? How should the correct mapping be stored in `exercise_keys` — JSON string in `key_text`, or structured `key_metadata`?

2. **Fill-in-the-blank: single vs multiple blanks.** Does the prompt support multiple blanks? If yes, answers and keys must become ordered arrays, which changes both the admin editor and the verify contract.

3. **True/false UI.** Should the student see a simple two-radio “Prawda / Fałsz” control (mirroring the admin key values `"true"`/`"false"`) or a statement + toggle?

4. **Matching interaction.** Drag-and-drop vs two-column select/dropdown? Drag-and-drop is better UX but heavier; select-based is MVP-friendly and more accessible.

5. **Answer schema in `verify.ts`.** Keep `answer: z.string()` and JSON-stringify matching maps, or widen to a discriminated union per exercise type?

6. **Case / punctuation normalization for FIB.** Current verify normalizes to lower-case and trims. Should FIB answers also ignore punctuation or articles? If so, normalization must become per-type or configurable.

7. **Sentence transformation scope.** S-06 title covers fill/match/truefalse, but the DB enum also has `sentence_transformation`. Should S-06 leave it as a placeholder (continuing the existing pattern) or include it? The PRD groups it with closed exercises, yet prior plans scoped it to S-07.

8. **Seed data correction.** The seed stores lesson_2_1 as `multiple_choice` with `["True", "False"]` options. Should it be re-seeded as `true_false` once the renderer exists, or left as-is to avoid breaking existing lesson progress during development?

9. **Admin list / edit for unsupported types.** If an exercise of type `matching`, `sentence_transformation`, or `open_ended` already exists in the DB, the edit page casts it to MC/FIB/T-F and will misrender it. Should the edit route show a “not editable yet” guard for those types?