# S-07 — sentence_transformation i open_ended — Krótki plan

> Pełny plan: `context/changes/sentence-transformation-and-open-ended/plan.md`  
> Badania: `context/changes/sentence-transformation-and-open-ended/research.md`

## Co i dlaczego

Wdrażamy ostatnie dwa typy ćwiczeń z roadmapy MVP: `sentence_transformation` (student przekształca zdanie, system weryfikuje warianty) oraz `open_ended` (student samodzielnie odpowiada i odsłania wzorzec). Dzięki temu zamykamy podstawowy zestaw typów ćwiczeń w BET.

## Punkt wyjścia

- DB enum już zawiera oba typy, a `verify.ts` już je obsługuje: `open_ended` zawsze zwraca `{ correct: false }`, a `sentence_transformation` przechodzi przez domyślną gałąź porównania z kluczami.
- `lessons/[id].astro` prawidłowo liczy `closedExerciseCount`, więc `open_ended` już nie blokuje ukończenia.
- Brak: formularz admina, komponenty studenta i widok edycji dla obu typów — obecnie wyświetlają placeholder.

## Pożądany stan końcowy

Admin może tworzyć i edytować oba typy ćwiczeń. Student rozwiązuje transformację zdania i widzi natychmiastowy feedback, a w pytaniu otwartym najpierw formułuje odpowiedź, a potem odsłania wzorzec do samooceny. Ukończenie lekcji wymaga tylko rozwiązania ćwiczeń zamkniętych.

## Kluczowe podjęte decyzje

| Decyzja | Wybór | Dlaczego | Źródło |
| --- | --- | --- | --- |
| Gdzie oryginalne zdanie | `payload.original` | Zgodne z seedem, separuje instrukcję od treści. | Plan |
| UI `open_ended` | Własna odpowiedź, potem przycisk „Pokaż wzorzec" | Wspiera aktywną samoocenę. | Plan |
| Porównanie odpowiedzi | `trim` + `lowercase` | Spójne z FIB, mniej frustracji. | Badania / Plan |
| Warianty transformacji | Dynamiczne wiersze, jak FIB | Spójność z istniejącym UI admina. | Plan |
| Zakres E2E | Admin tworzy + student rozwiązuje | Weryfikuje pełny flow, jak S-06. | Plan |
| Brak `payload.original` | Fallback do promptu | Odporność na historyczne / niepełne dane. | Plan |

## Zakres

**W zakresie:**
- Schematy payloadów i walidacja API admina dla S-07.
- Formularz admina z dedykowanymi polami dla obu typów.
- Dwa nowe komponenty studenta i integracja w `LessonInteractive`.
- Pobieranie odpowiedzi wzorcowej `open_ended` w stronie lekcji.
- Nowy spec E2E i pełny przebieg testów.

**Poza zakresem:**
- LLM do oceny pytań otwartych.
- Zmiany w modelu bazy danych.
- Modyfikacje istniejących testów S-04/S-06.

## Architektura / Podejście

```
Admin UI (ExerciseForm) ──► Admin API (index.ts / [id].ts) ──► DB (exercises + exercise_keys)
                                                                     │
Student UI (LessonInteractive) ◄── Strona lekcji ([id].astro) ◄───────┘
        │
        ├── SentenceTransformationExercise ──► verify.ts
        └── OpenEndedExercise (no verify, reference answer from [id].astro)
```

## Fazy w skrócie

| Faza | Co dostarcza | Kluczowe ryzyko |
| --- | --- | --- |
| 1. Schemat danych i API admina | Usunięcie guardów, walidacja payloadów, metadane `open_ended` | Niepoprawne oznaczenie klucza `open_ended` jako `is_reference_only` |
| 2. Formularz admina | UI dla oryginału/wariantów i wzorca | Zmiana typu ćwiczenia nie czyści stanu formularza |
| 3. Komponenty studenta i strona lekcji | Renderery i `referenceAnswers` | `OpenEndedExercise` niepoprawnie wpłynie na `completedExercises` |
| 4. Testy E2E i stabilizacja | Pełny zielony zestaw testów | Flaki związane z cleanup lub stanem auth po `db:reset` |

**Wymagania wstępne:** `dev` branch na zielono, S-04 i S-06 zarchiwizowane.  
**Szacowany wysiłek:** ~1 sesja implementacji + 1 sesja E2E/stabilizacji.

## Otwarte ryzyka i założenia

- Seed ma `payload.original`, ale schemat deklaruje pusty obiekt — wymaga synchronizacji.
- `verify.ts` już działa, ale musi pozostać nienaruszony, aby S-06 nie regresowało.
- `open_ended` musi być zapisany z `is_reference_only: true`, inaczej zepsuje się review mode.

## Kryteria sukcesu (podsumowanie)

- Admin tworzy i edytuje oba typy ćwiczeń.
- Student rozwiązuje `sentence_transformation` i widzi feedback.
- Student odsłania wzorzec w `open_ended` bez wpływu na completion.
- Pełny zestaw `npx playwright test tests/e2e/` jest zielony.
