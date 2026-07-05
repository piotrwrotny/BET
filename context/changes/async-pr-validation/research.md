---
date: 2026-07-02T09:00:00+02:00
researcher: AI Assistant
git_commit: 394c8ce
branch: module-5-l5
repository: piotrwrotny/BET
topic: "Design a dedicated PR validation workflow for packages/ai-toolkit"
tags: [research, github-actions, ci-cd, ai-toolkit, async-agent]
status: complete
last_updated: 2026-07-02
last_updated_by: AI Assistant
---

# Badanie: dedykowany workflow walidacji PR dla ai-toolkit

**Data**: 2026-07-02  
**Badacz**: AI Assistant  
**Git Commit**: [394c8ce](https://github.com/piotrwrotny/BET/commit/394c8ce)  
**Gałąź**: module-5-l5  
**Repozytorium**: piotrwrotny/BET

## Pytanie badawcze

Jak powinien wyglądać dedykowany workflow walidacji PR dla paczki `packages/ai-toolkit`, aby był spójny z istniejącymi workflowami BET, ale nie dublował logiki publikacji?

## Podsumowanie

W BET istnieją już dwa workflowy: `publish-ai-toolkit.yml` (walidacja + publikacja paczki) oraz `review.yml` (AI code review). Obecnie `publish-ai-toolkit.yml` uruchamia się zarówno na tagi `v*.*.*`, jak i na PR-y dotykające `packages/ai-toolkit/**`. To miesza odpowiedzialności: workflow publikacji robi też walidację PR. Najlepszym rozwiązaniem jest wydzielenie walidacji PR do osobnego workflowu `pr-validate-ai-toolkit.yml`, a z workflowu publikacji usunięcie triggera `pull_request`.

## Istniejące workflowy

### `.github/workflows/publish-ai-toolkit.yml`

- **Trigger**: `push` tagów `v*.*.*` oraz `pull_request` ze ścieżkami `packages/ai-toolkit/**` i `.github/workflows/publish-ai-toolkit.yml`.
- **Uprawnienia**: `contents: read`, `packages: write`.
- **Jobs**:
  - `validate` — sprawdza metadane `package.json`, obecność `rules/AGENTS.md`, uruchamia `npm test` i `npm pack --dry-run`.
  - `publish` — wymaga `validate`, publikuje paczkę przy tagu.
- **Wzorce**: `node-version-file: .nvmrc`, `working-directory: packages/ai-toolkit`, setup Node z `registry-url` i `scope: @piotrwrotny`.

### `.github/workflows/review.yml`

- **Trigger**: `pull_request` do `master`/`dev`.
- **Uprawnienia**: `contents: read`, `pull-requests: write`, `issues: write`.
- **Ciekawe wzorce**: `npm install --no-audit --no-fund`, przycinanie diffa, użycie lokalnej composite action.

## Struktura paczki

Paczka `packages/ai-toolkit/` zawiera:

- `package.json` z `test: "node --test test/**/*.test.js"`
- `install.js`, `uninstall.js`, `README.md`
- `rules/AGENTS.md`
- `config-templates/.gitattributes`, `config-templates/.vscode/settings.json`
- `test/install.test.js`

## Rekomendacja

1. Utworzyć `.github/workflows/pr-validate-ai-toolkit.yml` z jednym jobem `validate`.
2. Trigger: `pull_request` (dowolna gałąź) oraz `push` do `master`/`dev`/`module-5*`, ograniczone ścieżkami `packages/ai-toolkit/**` i `.github/workflows/pr-validate-ai-toolkit.yml`.
3. Job ma robić:
   - checkout
   - setup Node z `.nvmrc`
   - `npm test`
   - `npm pack --dry-run`
4. Uprawnienia tylko `contents: read` — nie potrzebuje `packages: write`.
5. Z `publish-ai-toolkit.yml` usunąć trigger `pull_request` i job `validate` pozostawić tylko dla tagów.

## Odniesienia

- `.github/workflows/publish-ai-toolkit.yml`
- `.github/workflows/review.yml`
- `packages/ai-toolkit/package.json`
- `packages/ai-toolkit/test/install.test.js`
