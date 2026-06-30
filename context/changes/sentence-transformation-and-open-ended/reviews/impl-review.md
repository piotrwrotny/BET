<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: S-07 — sentence_transformation i open_ended

- **Plan**: `context/changes/sentence-transformation-and-open-ended/plan.md`
- **Zakres**: Pełny plan (4 fazy)
- **Data**: 2026-06-30
- **Werdykt**: NEEDS ATTENTION
- **Ustalenia**: 0 krytycznych, 1 ostrzeżenie, 3 obserwacje

## Werdykty

| Wymiar | Werdykt |
|-----------|---------|
| Zgodność z planem | PASS |
| Dyscyplina zakresu | WARNING |
| Bezpieczeństwo i jakość | PASS |
| Architektura | PASS |
| Spójność wzorców | PASS |
| Kryteria sukcesu | WARNING |

## Ustalenia

### F1 — Brak skryptu `npm run typecheck`; naprawiono pre-existing błąd typów

- **Ważność**: ⚠️ OBSERVATION
- **Wpływ**: 🏃 LOW
- **Wymiar**: Kryteria sukcesu / Dyscyplina zakresu
- **Lokalizacja**: `src/pages/lessons/[id].astro:88`
- **Szczegóły**: Plan wymaga `npm run typecheck`, ale projekt nie posiada tego skryptu. Równoważne `npx astro check` upadało na pre-existing błędzie rzutowania `lesson.chapters`. Poprawka była konieczna, aby przejść weryfikację, ale wykracza poza planowane plazy 1.
- **Poprawka**: Dodaj do `package.json` skrypt `"typecheck": "astro check"`, aby plan był realizowalny w przyszłości bez adaptacji.
- **Decyzja**: FIXED — dodano `"typecheck": "astro check"` do `package.json`; `npm run typecheck` przechodzi z 0 błędów.

### F2 — `eslint-disable-next-line astro/no-set-html-directive` dla istniejącego `set:html`

- **Ważność**: ⚠️ OBSERVATION
- **Wpływ**: 🏃 LOW
- **Wymiar**: Bezpieczeństwo i jakość
- **Lokalizacja**: `src/pages/lessons/[id].astro:248`
- **Szczegóły**: Aby `npx eslint` na dotkniętych plikach przeszło, dodano komentarz wyłączający regułę dla istniejącego `set:html={contentHtml}`. Zawartość jest sanityzowana przez `sanitizeHtml`; komentarz nie wprowadza nowego ryzyka, ale maskuje ostrzeżenie w pliku poza zakresem S-07.
- **Poprawka**: Usuń komentarz i rozwiąż pre-existing problem z `set:html` (np. bezpieczniejszym komponentem), albo zaakceptuj jako znany dług.
- **Decyzja**: FIXED — dodano wyjaśnienie nad `set:html`, że `contentHtml` jest sanityzowane przez `sanitizeHtml()` przed wstrzyknięciem. Reguła ESLint pozostaje wyłączona dla istniejącego kodu.

### F3 — Pełny zestaw E2E nie przechodzi z powodu niezwiązanego z S-07 testu

- **Ważność**: ⚠️ WARNING
- **Wpływ**: 🔬 HIGH
- **Wymiar**: Kryteria sukcesu
- **Lokalizacja**: `tests/e2e/admin-users.spec.ts:55`
- **Szczegóły**: Po `npm run db:reset`, `npx playwright test tests/e2e/` zawodzi na teście `admin user management › admin can grant a book to a student` (timeout na `row.getByRole("combobox").click()`). Test nie dotyczy S-07; pozostałe 12 testów, w tym nowy spec S-07, przechodzą. Wpływa to na kryterium "pełny zestaw E2E przechodzi".
- **Poprawka A ⭐ Zalecana**: Zbadaj i napraw pre-existing/flaky `admin-users.spec.ts` w osobnym zadaniu, aby sukces całego zestawu był wiarygodny.
- **Poprawka B**: Tymczasowo oznacz test jako `@skip` lub zwiększ timeout, jeśli jest to znany problem środowiskowy.
- **Decyzja**: PENDING

### F4 — E2E używa dokładnych lokalizatorów tekstu z powodu serializacji props wysp Astro

- **Ważność**: ⚠️ OBSERVATION
- **Wpływ**: 🏃 LOW
- **Wymiar**: Spójność wzorców
- **Lokalizacja**: `tests/e2e/sentence-transformation-and-open-ended.spec.ts`
- **Szczegóły**: Strona lekcji renderuje `<code>` z serializowanymi propsami wysp Astro, przez co `getByText` dopasowywał zarówno widoczny tekst, jak i JSON w `<code>`. Spec używa `{ exact: true }` dla uniknięcia false-positive. Jest to prawidłowe, ale wskazuje, że inne specy mogą napotkać podobne problemy.
- **Poprawka**: Rozważ użycie bardziej semantycznych lokalizatorów (`getByRole`, `getByLabel`) w przyszłych specach, zamiast dosłownego tekstu.
- **Decyzja**: PENDING
