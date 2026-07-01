# Server-side lesson completion gating — Krótki plan

> Pełny plan: `context/changes/server-side-lesson-completion-gating/plan.md`
> Badania: `context/changes/server-side-lesson-completion-gating/research.md`
> Analiza domenowa: `context/domain/02-invariant-aggregate-refactor.md`

## Co i dlaczego

Dziś student może oznaczyć lekcję jako ukończoną bez rozwiązania ćwiczeń, bo jedynym gatingiem jest UI. Przenosimy regułę ukończenia (FR-015) na serwer: `POST /api/lessons/[id]/complete` będzie odrzucał żądanie, dopóki wszystkie ćwiczenia zamknięte nie mają poprawnych odpowiedzi utrwalonych w bazie.

## Punkt wyjścia

- `LessonInteractive.tsx` blokuje przycisk lokalnie, ale nie wysyła stanu na serwer.
- `POST /api/lessons/[id]/complete` robi pusty `upsert` do `lesson_progress`.
- `POST /api/exercises/verify` weryfikuje odpowiedzi, ale ich nie zapisuje.
- `lesson_progress` jest append-only — nieodwracalność postępu już działa.

## Pożądany stan końcowy

Serwer jest źródłem prawdy: ukończenie lekcji wymaga kliknięcia „Przeczytano” **oraz** poprawnego rozwiązania każdego zamkniętego ćwiczenia. UI nadal lokalnie blokuje przycisk dla UX, ale endpoint zwraca 409, gdy inwariant nie jest spełniony. Testy jednostkowe agregatu i zaktualizowane testy integracyjne chronią regułę.

## Kluczowe podjęte decyzje

| Decyzja | Wybór | Dlaczego | Źródło |
|---|---|---|---|
| Podejście do gatingu | Opcja A: utrwalać poprawne odpowiedzi + agregat | Jedyny sposób, by serwer był źródłem prawdy bez ponownego zaufania klientowi | Badania |
| Aggregate root | `LessonCompletion` | Zakres inwariantu to para (student, lekcja) | Badania |
| Miejsce inwariantu | Kod aplikacji (agregat) | Testowalne, nazwane błędy domenowe, unikamy trudnych w debugowaniu triggerów | Advisor / Plan |
| Client-side gating | Pozostawiamy jako UX optimization | Szybsza informacja zwrotna; serwer jest autorytatywny | Plan |
| Status błędu „nie rozwiązano” | 409 Conflict | Zasób nie może powstać w obecnym stanie | Plan |
| Co utrwalać | Tylko poprawne odpowiedzi, PK `(user_id, exercise_id)` | Najprostsze; wystarczy do gating | Plan |
| Trigger DB | Nie w MVP | Advisor rekomenduje unikanie; dodamy dopiero, jeśli pojawi się inna ścieżka zapisu | Advisor |

## Zakres

**W zakresie:**
- Nowa tabela `exercise_submissions` z RLS.
- Agregat `LessonCompletion` i jego repozytorium.
- Modyfikacja `verify.ts` do zapisu poprawnych submissions.
- Refactor `complete.ts` do użycia agregatu.
- Aktualizacja UI do obsługi 409.
- Testy jednostkowe agregatu i testy integracyjne.

**Poza zakresem:**
- Historia wszystkich prób.
- Automatyczne ukończenie lekcji po ostatnim ćwiczeniu.
- Zmiana zachowania ćwiczeń otwartych.
- Admin CRUD, nawigacja „Kontynuuj naukę”.

## Architektura / Podejście

```
Student rozwiązuje ćwiczenie
        │
        ▼
POST /api/exercises/verify
   verifyExercise(type, answer, keys)
        │
        ├─ correct + closed type ──► upsert exercise_submissions
        │
        ▼
Student klika „Przeczytano"
        │
        ▼
POST /api/lessons/[id]/complete
   loadLessonCompletion(...) ──► LessonCompletion.markComplete()
        │
        ├─ OK ──► insert lesson_progress ──► 200
        ├─ already completed ──► 200
        ├─ not all closed solved ──► 409
        └─ no access ──► 403
```

## Fazy w skrócie

| Faza | Co dostarcza | Kluczowe ryzyko |
|---|---|---|
| 1. Migracja i model danych | Tabela `exercise_submissions`, RLS, typy, seed | Polityki RLS za słabe lub za restrykcyjne |
| 2. Domena i utrwalanie | Agregat `LessonCompletion`, zapis z `verify.ts`, testy jednostkowe | Błąd w logice zamkniętych vs otwartych typów |
| 3. Endpoint i UI | `complete.ts` używa agregatu, UI obsługuje 409, testy integracyjne | Testy Playwright wymagają działającej lokalnej Supabase |

**Wymagania wstępne:** Działająca lokalna Supabase do uruchomienia testów integracyjnych.
**Szacowany wysiłek:** 1 sesja planowania + 3 fazy implementacji po ~30-60 min.

## Otwarte ryzyka i założenia

- Lokalna Supabase (Docker Desktop) jest potrzebna do uruchomienia testów integracyjnych; bez niej pozostają testy jednostkowe.
- Admin nie edytuje kluczy ćwiczeń po tym, jak studenci je rozwiązali. Jeśli tak się stanie, `exercise_submissions` może wymagać re-weryfikacji.
- Student nie może cofnąć ukończenia — to istniejące założenie, które zachowujemy.

## Kryteria sukcesu (podsumowanie)

- Serwer odrzuca ukończenie lekcji z nierozwiązanym zamkniętym ćwiczeniem (409).
- Student może ukończyć lekcję po poprawnym rozwiązaniu wszystkich zamkniętych ćwiczeń (200).
- Lekcja bez ćwiczeń nadal może być ukończona (200).
- Testy jednostkowe i integracyjne przechodzą.
