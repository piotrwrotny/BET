# Clean up remaining ESLint warnings — Krótki plan

> Pełny plan: `context/changes/cleanup-lint-warnings/plan.md`
> Badania: wykonane równolegle przez podagentów Explore

## Co i dlaczego

Wyczyścić 31 pozostałych ostrzeżeń ESLint, aby `npm run lint` był całkowicie
czysty i mógł zostać użyty jako bramka CI. Zmiana dotyczy wyłącznie
ostrzeżeń — żadna logika biznesowa nie ulega zmianie.

## Punkt wyjścia

Po naprawie końców linii lint przechodzi z kodem `0`, ale zostawia trzy grupy
ostrzeżeń:

1. `no-console` — CLI seed, serwerowe API routes, testy E2E.
2. `astro/no-unused-css-selector` — style Markdownu w lekcjach.
3. `react-hooks/incompatible-library` — `useReactTable` w tabeli użytkowników.

Badania potwierdziły, że dwa z tych ostrzeżeń (CSS, React Compiler) są
fałszywie pozytywne / znane upstreamowe ograniczenie.

## Pożądany stan końcowy

`npm run lint` zwraca `0` bez ostrzeżeń, style lekcji faktycznie działają dla
renderowanego Markdownu, a błędy serwerowe trafiają przez jeden helper
`src/lib/logger.ts`.

## Kluczowe podjęte decyzje

| Decyzja | Wybór | Dlaczego | Źródło |
|---|---|---|---|
| Logowanie błędów serwerowych | `src/lib/logger.ts` z `logServerError` | Centralizacja bez zewnętrznych zależności; łatwe późniejsze rozszerzenie | Plan |
| `console.*` w skryptach i E2E | `no-console: off` w ESLint dla `scripts/` i `tests/e2e/` | Tam logi są uzasadnione i pożądane | Plan |
| Style `.lesson-content` | `:global()` na selektorach potomków | Naprawia zarówno lint, jak i runtime scope'owanie Astro | Badania |
| Ostrzeżenie React Compiler | Lokalne `eslint-disable-next-line` z uzasadnieniem | Znane upstreamowe ograniczenie; refaktoryzacja nieopłacalna | Badania |

## Zakres

**W zakresie:**
- Utworzenie `src/lib/logger.ts`.
- Zastąpienie `console.error` w 6 plikach serwerowych.
- Relaksacja `no-console` dla `scripts/` i `tests/e2e/`.
- Naprawa scope'owania CSS w `src/pages/lessons/[id].astro`.
- Wyciszenie ostrzeżenia React Compiler w `UsersTable.tsx`.
- Pełna weryfikacja lint/typecheck/unit/E2E.

**Poza zakresem:**
- Nowe frameworki logowania (Sentry itp.).
- Refaktoryzacja tabeli użytkowników bez `useReactTable`.
- Zmiana semantyki logów (np. przekształcenie w telemetry).

## Architektura / Podejście

```
console.error w API/service  →  src/lib/logger.ts
console.* w CLI/testach      →  ESLint override
.lesson-content tag          →  .lesson-content :global(tag)
useReactTable warning        →  reasoned eslint-disable
```

## Fazy w skrócie

| Faza | Co dostarcza | Kluczowe ryzyko |
|---|---|---|
| 1. Logger + ESLint config | Czyste `no-console` w całym repo | Nowy plik — trzeba zaprojektować minimalny kontrakt |
| 2. CSS + React Compiler | Czysty lint dla Astro i React | `:global()` musi być zastosowane we wszystkich selektorach |
| 3. Regresja | Dowód braku regresji | Długie E2E; możliwe flaky na Windows |

**Wymagania wstępne:** Brak; wszystkie zmiany są lokalne.
**Szacowany wysiłek:** Niski — 1 faza implementacji + 1 faza weryfikacji.

## Otwarte ryzyka i założenia

- `useReactTable` pozostaje niekompatybilny z React Compiler — zakładamy, że
  upstream rozwiąże to w przyszłości.
- Wizualna weryfikacja stylów lekcji jest potrzebna, bo `:global()` zmienia
  scope'owanie CSS.

## Kryteria sukcesu (podsumowanie)

- `npm run lint` — 0 errors, 0 warnings.
- `npm run typecheck`, `npm run test:unit`, `npm run test:coverage` — zielone.
- Wybrane E2E (`admin-users`, `closed-exercises`, `sentence-transformation`)
  — zielone.
