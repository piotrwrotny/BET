# Async PR validation for ai-toolkit — Krótki plan

> Pełny plan: `context/changes/async-pr-validation/plan.md`
> Badania: `context/changes/async-pr-validation/research.md`

## Co i dlaczego

Wydzielamy walidację PR paczki `@piotrwrotny/ai-toolkit` do osobnego workflowu. Obecnie workflow publikacji (`publish-ai-toolkit.yml`) uruchamia się również na PR-y, co miesza odpowiedzialności i nadaje mu zbędne uprawnienia `packages: write` przy każdym PR.

## Punkt wyjścia

- `packages/ai-toolkit/` ma testy i `npm pack --dry-run`.
- `publish-ai-toolkit.yml` zawiera job `validate` oraz trigger `pull_request`.

## Pożądany stan końcowy

- `.github/workflows/pr-validate-ai-toolkit.yml` waliduje paczkę na PR-y i push-e do głównych gałęzi.
- `publish-ai-toolkit.yml` reaguje tylko na tagi semver.

## Kluczowe decyzje

| Decyzja | Wybór | Dlaczego |
|---|---|---|
| Workflow | Osobny `pr-validate-ai-toolkit.yml` | Rozdzielenie odpowiedzialności: walidacja vs publikacja. |
| Triggery | PR + push do `master`/`dev`/`module-5*` | Pokrywa standardowe ścieżki bez uruchamiania się na każdym PR w repo. |
| Uprawnienia | `contents: read` | Walidacja nie potrzebuje uprawnień do zapisu pakietów. |
| Walidacja | `npm test` + `npm pack --dry-run` | Wykorzystanie istniejących mechanizmów paczki. |

## Zakres

**W zakresie:**
- Nowy workflow walidacyjny.
- Usunięcie triggera PR z workflowu publikacji.
- Weryfikacja w GitHub Actions.

**Poza zakresem:**
- Zmiany w samej paczce.
- Nowe testy.
- Refaktoryzacja joba `validate` poza przeniesieniem.

## Architektura

```
PR / push ──► pr-validate-ai-toolkit.yml ──► npm test + npm pack --dry-run

tag v*.*.* ──► publish-ai-toolkit.yml ──► validate + npm publish
```

## Fazy w skrócie

| Faza | Co dostarcza | Ryzyko |
|---|---|---|
| 1. Nowy workflow | `pr-validate-ai-toolkit.yml` | Błąd składni YAML lub triggerów. |
| 2. Czyszczenie publikacji | `publish-ai-toolkit.yml` bez PR triggera | Usunięcie za dużo triggerów. |
| 3. Weryfikacja | Zielony run w Actions | Workflow nie uruchamia się na branchu. |

**Szacowany wysiłek:** Jedna sesja, 3 fazy.

## Kryteria sukcesu

- `npm run lint` czyste.
- `npm test` i `npm pack --dry-run` w paczce czyste.
- Workflow `Validate AI Toolkit` widoczny i zielony w GitHub Actions po pushu.
