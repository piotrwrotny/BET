# S-06: Closed exercise types — fill-in-blank, matching, true/false — Krótki plan

> Pełny plan: `context/changes/closed-exercises-fill-match-truefalse/plan.md`  
> Badania: `context/changes/closed-exercises-fill-match-truefalse/research.md`

## Co i dlaczego

Rozszerzamy silnik ćwiczeń o trzy brakujące typy zamknięte: fill-in-the-blank, matching i true/false. Dziś student widzi je jako placeholder, a liczenie ćwiczeń zamkniętych ignoruje je — co pozwala zaliczyć lekcję bez rozwiązania (FR-015).

## Punkt wyjścia

- Baza obsługuje sześć typów, aplikacja zna tylko MC/FIB/T-F.
- `ExerciseForm.tsx` nie ma gałęzi matchingu.
- `verify.ts` porównuje stringi — FIB/T-F działają, matching nie.
- `LessonInteractive.tsx` renderuje wszystko poza MC jako placeholder.
- `lessons/[id].astro` liczy `closedExerciseCount` tylko po `multiple_choice`.

## Pożądany stan końcowy

Admin tworzy/edytuje FIB, T-F i matching; student je rozwiązuje; verify akceptuje poprawne odpowiedzi; lekcja zalicza się dopiero po wszystkich zamkniętych typach; review mode pokazuje poprawne odpowiedzi; `sentence_transformation` i `open_ended` pozostają placeholdery.

## Kluczowe podjęte decyzje

| Decyzja | Wybór | Dlaczego | Źródło |
| --- | --- | --- | --- |
| Payload matchingu | `{ pairs: [{ left, right }] }` | Jednolity z komentarzem migracji | Plan |
| Klucz matchingu | Jeden `key_text` z JSON mapy `{ leftIndex: rightIndex }` | Zachowuje kontrakt verify (string) | Plan |
| Odpowiedź matchingu | `JSON.stringify({ leftIndex: rightIndex })` | Bez zmiany `answer: z.string()` | Plan |
| Liczenie zamkniętych | `type !== "open_ended"` | Zgodne z FR-015 i review | Badania/Plan |
| Luki w FIB | Jedna luka na ćwiczenie | Prostsze UX i verify | Plan |
| Nieobsługiwane typy | Guard „not editable yet" | Zapobiega błędnemu castowaniu | Plan |

## Zakres

**W zakresie:** schematy Zod per type, `ExerciseTypeEnum` z sześcioma wartościami, edytor matchingu w `ExerciseForm.tsx`, komponenty studenta FIB/T-F/Matching, dispatcher w `LessonInteractive.tsx`, fix `closedExerciseCount`, gałąź matching w `verify.ts`, review-mode correct answers, guard admin edit, re-seed `lesson_2_1`, E2E.

**Poza zakresem:** `sentence_transformation`, `open_ended`, zmiana kontraktu API verify na unię dyskryminowaną, wielolukowe FIB.

## Architektura / Podejście

```
Admin (ExerciseForm + API) ──payload + keys──► DB
                                      │
                                      ▼
Student (LessonInteractive dispatcher) ──answer──► verify.ts
                                      │
                                      ▼
                   compare strings (MC/FIB/T-F)
                   compare JSON maps (matching)
```

Rozszerzamy istniejący wzorzec MC. Wszystkie renderery dziedziczą ten sam kontrakt propsów i wywołują `onCorrect` po poprawnej odpowiedzi.

## Fazy w skrócie

| Faza | Co dostarcza | Kluczowe ryzyko |
| --- | --- | --- |
| 1. Schema/types + admin | Zod per type, matching w formularzu/admin API | Błędna walidacja payloadu matchingu |
| 2. Student renderers | Komponenty + dispatcher + fix liczenia | Regresja w ukończeniu lekcji |
| 3. Verify + review | Weryfikacja JSON map + poprawne odpowiedzi | Niespójny format JSON klucza/odpowiedzi |
| 4. Seed + E2E | Poprawny seed i testy Playwright | Flaki E2E przez stan bazy |

**Wymagania wstępne:** Zakończony S-01/S-02.  
**Szacowany wysiłek:** 2-3 sesje w 4 fazach.

## Otwarte ryzyka i założenia

- Format JSON mapy matchingu musi być identyczny po stronie admina i studenta.
- `supabase db reset` jest wymagany, aby seed `lesson_2_1` się zaktualizował.
- Testy E2E zakładają działający Playwright setup (auth, seed).

## Kryteria sukcesu (podsumowanie)

- Admin tworzy i edytuje FIB, T-F oraz matching.
- Student rozwiązuje każdy typ i lekcja zalicza się dopiero po wszystkich zamkniętych.
- `sentence_transformation` i `open_ended` pozostają placeholdery.
- `npx playwright test` przechodzi.
