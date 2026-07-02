# Plan wdrożenia — Async PR validation for ai-toolkit

## Przegląd

Wydzielamy walidację PR paczki `packages/ai-toolkit/` z workflowu publikacji do osobnego workflowu `pr-validate-ai-toolkit.yml`. Workflow publikacji zostaje uruchamiany tylko na tagi semver, a nowy workflow waliduje każdy PR i push do gałęzi głównych bez potrzeby uprawnień do pakietów.

## Analiza stanu obecnego

- `packages/ai-toolkit/` ma testy (`npm test`) i można wykonać `npm pack --dry-run`.
- `.github/workflows/publish-ai-toolkit.yml` zawiera job `validate`, który uruchamia się zarówno na tagi, jak i na PR-y.
- Workflow publikacji ma uprawnienie `packages: write`, które walidacja PR nie potrzebuje.

## Pożądany stan końcowy

- Nowy plik `.github/workflows/pr-validate-ai-toolkit.yml` z jobem `validate`.
- Workflow uruchamia się na PR-y oraz push do `master`, `dev` i `module-5*` przy zmianach w `packages/ai-toolkit/**` lub samym workflow.
- `publish-ai-toolkit.yml` traci trigger `pull_request`.
- `npm test` i `npm pack --dry-run` przechodzą zielono w nowym workflow.

## Czego NIE robimy

- Nie zmieniamy logiki publikacji poza usunięciem triggera PR.
- Nie dodajemy nowych testów do paczki.
- Nie zmieniamy zawartości paczki (`rules/`, `install.js` itp.).

## Podejście do implementacji

1. Utworzyć nowy workflow walidacyjny jako kopię joba `validate` z `publish-ai-toolkit.yml`, ale bez uprawnień `packages: write` i bez joba `publish`.
2. Usunąć trigger `pull_request` z `publish-ai-toolkit.yml`.
3. Wypchnąć branch i zweryfikować, że nowy workflow pojawia się w zakładce Actions.

## Faza 1: Utworzenie dedykowanego workflowu PR

### Przegląd

Dodanie `.github/workflows/pr-validate-ai-toolkit.yml` z walidacją paczki.

### Wymagane zmiany:

#### 1.1. Nowy workflow walidacyjny

**Plik**: `.github/workflows/pr-validate-ai-toolkit.yml`

**Cel**: Uruchamiać testy i dry-run pack na PR-y i push-e dotykające paczki.

**Kontrakt**:
- `name: Validate AI Toolkit`
- `on.pull_request` oraz `on.push.branches: [master, dev, module-5*]`
- `paths: ["packages/ai-toolkit/**", ".github/workflows/pr-validate-ai-toolkit.yml"]`
- `permissions: contents: read`
- Jobs:
  - `validate` z `runs-on: ubuntu-latest`, `working-directory: packages/ai-toolkit`
  - setup Node z `.nvmrc`
  - `npm test`
  - `npm pack --dry-run`

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- `npm run lint` w root przechodzi.
- `cd packages/ai-toolkit && npm test` przechodzi lokalnie.
- `cd packages/ai-toolkit && npm pack --dry-run` przechodzi lokalnie.

#### Weryfikacja ręczna:

- Nowy workflow widoczny w `.github/workflows/`.
- Po wypchnięciu brancha workflow pojawia się w zakładce Actions.

## Faza 2: Oczyszczenie workflowu publikacji

### Przegląd

Usunięcie triggera `pull_request` z `publish-ai-toolkit.yml`, aby publikacja reagowała tylko na tagi.

### Wymagane zmiany:

#### 2.1. Usunięcie triggera PR

**Plik**: `.github/workflows/publish-ai-toolkit.yml`

**Cel**: Workflow publikacji ma służyć wyłącznie publikacji po tagu.

**Kontrakt**:
- Pozostawiamy tylko trigger `push.tags: ["v*.*.*"]`.
- Usuwamy cały blok `pull_request`.
- Job `validate` pozostaje, bo jest wymagany przez `publish.needs`.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- `npm run lint` w root przechodzi.
- `git diff` pokazuje tylko zmiany w `.github/workflows/`.

#### Weryfikacja ręczna:

- Przegląd diffu: brak niezamierzonych zmian.

## Faza 3: Weryfikacja w repozytorium

### Przegląd

Wypchnięcie brancha `module-5-l5` i obserwacja nowego workflow w Actions.

### Wymagane zmiany:

#### 3.1. Push brancha

**Plik**: git

**Cel**: Uruchomić workflow w GitHub Actions.

**Kontrakt**: `git push origin module-5-l5`.

#### 3.2. Sprawdzenie wyniku

**Plik**: GitHub Actions web UI / API

**Cel**: Potwierdzić, że workflow `Validate AI Toolkit` uruchamia się i przechodzi.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Brak nowych błędów lint.

#### Weryfikacja ręczna:

- W zakładce Actions widoczny run `Validate AI Toolkit` dla brancha `module-5-l5`.
- Run kończy się sukcesem.

## Strategia testowania

### Testy jednostkowe:

- Brak nowych testów — używamy istniejących testów paczki.

### Testy integracyjne:

- Uruchomienie `npm test` i `npm pack --dry-run` w `packages/ai-toolkit/`.
- Obserwacja zielonego runu w GitHub Actions.

### Kroki testowania ręcznego:

1. Sprawdzić, że workflow jest widoczny w repo po pushu.
2. Sprawdzić, że `publish-ai-toolkit.yml` nie ma już triggera `pull_request`.

## Referencje

- Badania: `context/changes/async-pr-validation/research.md`
- Istniejący workflow publikacji: `.github/workflows/publish-ai-toolkit.yml`
- Paczka: `packages/ai-toolkit/`

## Postęp

### Faza 1: Utworzenie dedykowanego workflowu PR

#### Automatyczne

- [x] 1.1 Utworzono `.github/workflows/pr-validate-ai-toolkit.yml` — 1cc40d4
- [x] 1.2 `npm run lint` przechodzi — 1cc40d4
- [x] 1.3 `npm test` w paczce przechodzi — 1cc40d4
- [x] 1.4 `npm pack --dry-run` w paczce przechodzi — 1cc40d4

#### Ręczne

- [x] 1.5 Przegląd nowego workflow — 1cc40d4

### Faza 2: Oczyszczenie workflowu publikacji

#### Automatyczne

- [x] 2.1 Usunięto trigger `pull_request` z `publish-ai-toolkit.yml`
- [x] 2.2 `npm run lint` przechodzi

#### Ręczne

- [x] 2.3 Przegląd diffu

### Faza 3: Weryfikacja w repozytorium

#### Automatyczne

- [ ] 3.1 Branch wypchnięty

#### Ręczne

- [ ] 3.2 Workflow widoczny w Actions
- [ ] 3.3 Run zakończony sukcesem
