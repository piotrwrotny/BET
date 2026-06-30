# Bootstrap unit and contract runner for exercise verification — Krótki plan

> Pełny plan: `context/changes/testing-unit-contract-runner/plan.md`
> Badania: `context/changes/testing-unit-contract-runner/research.md`

## Co i dlaczego

Wdrażamy pierwszą fazę `context/foundation/test-plan.md`: instalujemy Vitest, wyodrębniamy czystą logikę weryfikacji ćwiczeń z endpointu Astro i zamykamy testami jednostkowymi/kontraktowymi ryzyka związane z błędnym akceptowaniem odpowiedzi, łamaniem schematu kluczy i krawędziami normalizacji.

## Punkt wyjścia

Projekt ma tylko testy E2E Playwright. Logika weryfikacji żyje w `src/pages/api/exercises/verify.ts` i zawiera czyste funkcje, ale nie jest wyodrębniona ani pokryta testami jednostkowymi.

## Pożądany stan końcowy

- Vitest skonfigurowany z osobnymi skryptami `test:unit`.
- `src/lib/verify-exercise.ts` zawiera testowalną logikę weryfikacji.
- `src/lib/verify-exercise.test.ts` i `src/lib/verify-contract.test.ts` przechodzą.
- E2E nie regresuje; cookbook w `context/foundation/test-plan.md` został zaktualizowany.

## Kluczowe podjęte decyzje

| Decyzja                       | Wybór            | Dlaczego (1 zdanie)  | Źródło           |
| ------------------------------ | ----------------- | ----------------- | ---------------- |
| Runner testów jednostkowych    | Vitest           | Natywne wsparcie Vite/TS w Astro, minimalna konfiguracja, szybki HMR. | Plan |
| Miejsce logiki weryfikacji     | `src/lib/verify-exercise.ts` | Oddziela czystą logikę od Astro/HTTP/DB, umożliwia tanie testy jednostkowe. | Plan |
| Zakres testów kontraktowych    | Round-trip payload → keys → verify | Sprawdza spójność admin API i verify bez potrzeby uruchamiania serwera/bazy. | Plan |
| Nieznany typ ćwiczenia         | `verifyExercise` zwraca `false` | Zapobiega fałszywym pozytywom przy błędnych danych. | Plan |

## Zakres

**W zakresie:**
- Instalacja Vitest + skrypty.
- Wyodrębnienie logiki z `verify.ts`.
- Testy jednostkowe normalizacji, wariantów, `is_reference_only`, matchingu.
- Testy kontraktowe dla wszystkich 6 typów ćwiczeń.
- Aktualizacja cookbook w `context/foundation/test-plan.md`.

**Poza zakresem:**
- Testowanie autoryzacji/RLS (Faza 2 test-planu).
- Konfiguracja CI/GitHub Actions.
- Zmiana zachowania biznesowego weryfikacji.

## Architektura / Podejście

```
verify.ts (Astro route)
    ↓  HTTP context, auth, DB fetch
verifyExercise(type, answer, keys)  ← src/lib/verify-exercise.ts
    ↓  pure dispatch
normalizeAnswer / verifyMatchingAnswer / verifyClosedAnswer
    ↓
parseMatchingKey (existing in exercise-schemas.ts)
```

## Fazy w skrócie

| Faza     | Co dostarcza       | Kluczowe ryzyko                  |
| --------- | ---------------------- | ------------------------- |
| 1. Instalacja Vitest | Runner i skrypty testowe | Kolizja z Playwright |
| 2. Wyodrębnienie logiki | `src/lib/verify-exercise.ts` + refaktoryzacja `verify.ts` | Regresja zachowania endpointu |
| 3. Testy jednostkowe | `verify-exercise.test.ts` | Wyrocznia skopiowana z implementacji |
| 4. Testy kontraktowe | `verify-contract.test.ts` | Niezgodność formatu admin API z verify |
| 5. Stabilizacja | Zielone typecheck/lint/unit/E2E + cookbook | Brak aktualizacji dokumentacji |

**Wymagania wstępne:** Node.js zgodny z `package.json`, działające E2E Playwright.
**Szacowany wysiłek:** 1 sesja, 5 faz.

## Otwarte ryzyka i założenia

- Refaktoryzacja `verify.ts` musi zachować 1:1 zachowanie — E2E jest baseline.
- Vitest nie powinien próbować uruchamiać speców Playwright.

## Kryteria sukcesu (podsumowanie)

- `npm run test:unit` przechodzi z co najmniej 20 asercjami i 100% coverage `verify-exercise.ts`.
- `npm run typecheck` i `npm run lint` pozostają zielone.
- Pełny zestaw E2E przechodzi bez regresji.
- `context/foundation/test-plan.md` §6 zawiera wzorce unit/kontrakt.
