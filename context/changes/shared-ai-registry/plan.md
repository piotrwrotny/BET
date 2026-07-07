# Plan wdrożenia — Shared AI Registry: @piotrwrotny/ai-toolkit

## Przegląd

Wdrażamy minimalny pakiet npm `@piotrwrotny/ai-toolkit` publikowany do GitHub Packages, który dystrybuuje reguły zespołowe i konfigurację narzędzi z jednego źródła prawdy. Pakiet zostanie opublikowany ręcznie przez tag semver `v0.1.0`, a następnie przetestowany jako instalacja w repo BET (konsumencie).

## Analiza stanu obecnego

- BET ma ustalone reguły w `AGENTS.md` oraz lekcje w `context/foundation/lessons.md`.
- W repo znajdują się gotowe szablony M5L4 w `.omp/configs/` i `.omp/prompts/`.
- Brak scentralizowanego, wersjonowanego sposobu dystrybucji reguł do innych projektów zespołu.
- Model dystrybucji: GitHub Packages (Model 1) — najniższy próg wejścia, pasuje do obecnego środowiska GitHub.

### Kluczowe odkrycia:

- `AGENTS.md:7-60` zawiera twarde zasady, które powinny trafić do zarządzanego bloku w konsumencie.
- `context/foundation/lessons.md` zawiera lekcje zespołowe, które warto dołączyć do pakietu jako część reguł.
- BET używa `AGENTS.md`, a nie `CLAUDE.md`, więc instalator musi targetować `AGENTS.md`.
- Manualne `npx @piotrwrotny/ai-toolkit install` wymaga, aby instalator domyślnie używał `process.cwd()` lub zmiennej `PROJECT_ROOT`.

## Pożądany stan końcowy

- `packages/ai-toolkit/` w repo BET zawiera źródło pakietu.
- `.github/workflows/publish-ai-toolkit.yml` publikuje pakiet do GitHub Packages po pushu tagu `v*.*.*`.
- Pakiet `@piotrwrotny/ai-toolkit@0.1.0` jest widoczny w rejestrze GitHub Packages.
- W BET powstał zarządzany blok reguł między znacznikami `<!-- BEGIN @piotrwrotny/ai-toolkit -->` i `<!-- END @piotrwrotny/ai-toolkit -->` w `AGENTS.md`.
- W `.claude/.ai-toolkit-manifest.json` zapisano manifest instalacji.
- Dostępne są zrzuty / logi potwierdzające spełnienie kryteriów 10xChampion.

## Czego NIE robimy

- Nie budujemy osobnego repo źródła prawdy w MVP (używamy `packages/ai-toolkit/` w BET).
- Nie dołączamy skilli w wersji 0.1.0 (skille w wersji 0.2.0).
- Nie wdrażamy semantic-release ani CodeArtifact.
- Nie zmieniamy istniejących workflowów BET poza dodaniem workflow publikacji pakietu.

## Podejście do implementacji

Zaczynamy od minimalnego, działającego pakietu:
1. Szkielet pakietu z `package.json`, `install.js`, `uninstall.js`, `rules/AGENTS.md` i szablonami konfiguracji.
2. Workflow publikacji na tagi semver.
3. Publikacja `v0.1.0` i instalacja w BET.
4. Dokumentacja oraz zrzuty dla odznaki.

Instalator będzie obsługiwał dwa tryby:
- `postinstall` przy instalacji jako zależność — wykrywa katalog projektu jako rodzica `node_modules`.
- manualne `npx @piotrwrotny/ai-toolkit install` — używa `process.cwd()` (lub `PROJECT_ROOT`).

## Faza 1: Szkielet pakietu i instalator

### Przegląd

Utworzenie folderu `packages/ai-toolkit/` z metadanymi pakietu, regułami zespołowymi, szablonami konfiguracji oraz idempotentnym instalatorem/deinstalatorem.

### Wymagane zmiany:

#### 1.1. package.json pakietu

**Plik**: `packages/ai-toolkit/package.json`

**Cel**: Zdefiniować pakiet `@piotrwrotny/ai-toolkit@0.1.0`, wskazać rejestr GitHub Packages, pliki do publikacji oraz skrypt `postinstall`.

**Kontrakt**:
- `name`: `@piotrwrotny/ai-toolkit`
- `version`: `0.1.0`
- `publishConfig.registry`: `https://npm.pkg.github.com`
- `files`: `["rules/", "config-templates/", "install.js", "uninstall.js", "README.md"]`
- `scripts.postinstall`: `"node install.js"`
- `bin.ai-toolkit`: `"./install.js"`

#### 1.2. Reguły zespołowe

**Plik**: `packages/ai-toolkit/rules/AGENTS.md`

**Cel**: Wyciągnąć istniejące zasady z root `AGENTS.md` i `context/foundation/lessons.md` do pliku, który instalator wklei między znaczniki sentinel w konsumencie.

**Kontrakt**: Plik zawiera tylko reguły do wstrzyknięcia — bez nagłówka repo, bez linków do konkretnego projektu.

#### 1.3. Szablony konfiguracji

**Plik**: `packages/ai-toolkit/config-templates/.gitattributes`, `packages/ai-toolkit/config-templates/.vscode/settings.json`

**Cel**: Dostarczyć gotowe szablony konfiguracji narzędzi (LF endings, ustawienia VS Code). Instalator może je opcjonalnie skopiować.

**Kontrakt**: Szablony są kopiowane tylko wtedy, gdy konsument nie ma jeszcze danego pliku (unikamy nadpisania ręcznych ustawień).

#### 1.4. Instalator install.js

**Plik**: `packages/ai-toolkit/install.js`

**Cel**: Idempotentnie zainstalować reguły i szablony w repo konsumenta.

**Kontrakt**:
- Wykrywa root projektu: jeśli ścieżka skryptu zawiera `node_modules`, używa rodzica `node_modules`; w przeciwnym razie `process.cwd()` lub `PROJECT_ROOT`.
- Kopiuje `rules/AGENTS.md` między znaczniki `<!-- BEGIN @piotrwrotny/ai-toolkit -->` / `<!-- END @piotrwrotny/ai-toolkit -->` w istniejącym `AGENTS.md` konsumenta; tworzy plik, jeśli nie istnieje.
- Kopiuje szablony konfiguracji tylko gdy plik docelowy nie istnieje.
- Zapisuje manifest `.claude/.ai-toolkit-manifest.json` z listą zainstalowanych plików.
- Obsługuje argument `install` (domyślnie) oraz `uninstall` (deleguje do `uninstall.js`).
- Błędy instalatora nie powinny zabijać `npm install` (try/catch + console.warn).

#### 1.5. Deinstalator uninstall.js

**Plik**: `packages/ai-toolkit/uninstall.js`

**Cel**: Czysto usunąć zarządzane przez pakiet pliki i blok reguł.

**Kontrakt**:
- Czyta manifest i usuwa wymienione pliki.
- Usuwa blok sentinel z `AGENTS.md`.
- Usuwa manifest.

#### 1.6. README pakietu

**Plik**: `packages/ai-toolkit/README.md`

**Cel**: Dokumentacja instalacji, uwierzytelniania i aktualizacji.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- `npm pack --dry-run` w `packages/ai-toolkit/` zawiera tylko oczekiwane pliki.
- `node packages/ai-toolkit/install.js` z `PROJECT_ROOT=$(pwd)` nie rzuca błędu i tworzy/aktualizuje `AGENTS.md` oraz `.claude/.ai-toolkit-manifest.json`.
- `node packages/ai-toolkit/uninstall.js` z `PROJECT_ROOT=$(pwd)` usuwa zarządzane pliki i blok z `AGENTS.md`.
- `npm run lint` w root BET pozostaje czyste.

#### Weryfikacja ręczna:

- Przegląd zawartości `packages/ai-toolkit/rules/AGENTS.md` pod kątem poprawności reguł.
- Sprawdzenie, czy blok sentinel w root `AGENTS.md` jest poprawnie sformatowany.

## Faza 2: CI/CD publikacji

### Przegląd

Dodanie workflow GitHub Actions, który waliduje i publikuje pakiet do GitHub Packages po pushu tagu `v*.*.*`.

### Wymagane zmiany:

#### 2.1. Workflow publikacji

**Plik**: `.github/workflows/publish-ai-toolkit.yml`

**Cel**: Automatycznie opublikować pakiet przy tagu semver.

**Kontrakt**:
- Trigger: `push` tagów `v*.*.*`.
- Uprawnienia: `contents: read`, `packages: write`.
- `actions/setup-node@v4` z `registry-url: https://npm.pkg.github.com`, `scope: "@piotrwrotny"`.
- Kroki walidacji: `package.json` ma `name`, `version`, `publishConfig.registry`; `npm pack --dry-run` przechodzi.
- Publikacja: `npm publish` z `NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`.
- Opcjonalnie: sprawdzenie, że tag odpowiada `version` z `package.json`.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Workflow przechodzi walidację na PR/Branch (dry-run).
- Po pushu tagu `v0.1.0` pakiet pojawia się w sekcji Packages repozytorium na GitHub.

#### Weryfikacja ręczna:

- Sprawdzenie w zakładce Packages/GitHub Actions, że publikacja zakończyła się sukcesem.

## Faza 3: Publikacja i instalacja konsumencka

### Przegląd

Opublikowanie wersji 0.1.0 i przetestowanie instalacji w repo BET.

### Wymagane zmiany:

#### 3.1. Utworzenie tagu v0.1.0

**Plik**: git tag

**Cel**: Wyzwolić workflow publikacji.

**Kontrakt**: Tag `v0.1.0` wskazuje na commit ze szkieletem pakietu i workflow.

#### 3.2. Uwierzytelnienie konsumenta

**Plik**: lokalne `.npmrc` (tymczasowe, nie commitowane)

**Cel**: Umożliwić `npx @piotrwrotny/ai-toolkit install` odczyt z prywatnego rejestru.

**Kontrakt**: Użytkownik lokalnie loguje się przez `npm login --scope=@piotrwrotny --registry=https://npm.pkg.github.com` lub ustawia `GH_PKG_TOKEN`.

#### 3.3. Instalacja w BET

**Plik**: root `AGENTS.md`, `.claude/.ai-toolkit-manifest.json`

**Cel**: Zweryfikować, że pakiet działa w prawdziwym repo konsumenta.

**Kontrakt**: Po `npx @piotrwrotny/ai-toolkit install` w root BET pojawia się zarządzany blok reguł, a manifest zawiera listę plików.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Pakiet `@piotrwrotny/ai-toolkit@0.1.0` jest dostępny w GitHub Packages (API zwraca wersję).
- `npx @piotrwrotny/ai-toolkit install` kończy się kodem 0.
- `cat .claude/.ai-toolkit-manifest.json` zawiera `version: 0.1.0` i listę plików.

#### Weryfikacja ręczna:

- Sprawdzenie w zakładce Packages w repozytorium piotrwrotny/BET, że wersja 0.1.0 istnieje.
- Wizualna weryfikacja bloku reguł w `AGENTS.md`.
- Test deinstalacji: `npx @piotrwrotny/ai-toolkit uninstall` usuwa blok i manifest.

## Faza 4: Dokumentacja i dowody dla 10xChampion

### Przegląd

Zebranie zrzutów ekranu / logów i aktualizacja dokumentów projektowych.

### Wymagane zmiany:

#### 4.1. Aktualizacja change.md

**Plik**: `context/changes/shared-ai-registry/change.md`

**Cel**: Zapisać linki do workflow, tagu, pakietu i instrukcję dla konsumenta.

#### 4.2. Instrukcja konsumenta

**Plik**: `packages/ai-toolkit/README.md` oraz ewentualnie `context/changes/shared-ai-registry/README.md`

**Cel**: Dokumentacja krok po kroku: jak uwierzytelnić się, zainstalować i zaktualizować pakiet.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- `npm run lint` w root BET jest czysty.

#### Weryfikacja ręczna:

- Zrzut ekranu/zakładki Packages z wersją 0.1.0.
- Zrzut ekranu/zakładki Actions z zielonym runem publikacji.
- Zrzut ekranu/fragment `AGENTS.md` z zarządzanym blokiem.

## Strategia testowania

### Testy jednostkowe:

- Brak — instalator jest prostym skryptem Node; testujemy go end-to-end.

### Testy integracyjne:

- `npm pack --dry-run` w `packages/ai-toolkit/`.
- Lokalny test `install.js` / `uninstall.js` z `PROJECT_ROOT=$(pwd)`.
- Publikacja tagu i instalacja przez `npx`.

### Kroki testowania ręcznego:

1. Upewnić się, że root `AGENTS.md` ma zarządzany blok reguł.
2. Uruchomić `npx @piotrwrotny/ai-toolkit install` i sprawdzić manifest.
3. Uruchomić `npx @piotrwrotny/ai-toolkit uninstall` i sprawdzić, że blok zniknął.
4. Zweryfikować pakiet w zakładce Packages na GitHub.

## Uwagi dotyczące wydajności

Pakiet jest mały (< 100 KB); instalacja i publikacja są szybkie.

## Uwagi dotyczące migracji

Ponieważ konsumentem testowym jest samo repo BET, aktualizacja pakietu polega na:
1. Zmianie `version` w `packages/ai-toolkit/package.json`.
2. Push tagu `v0.2.0`.
3. `npx @piotrwrotny/ai-toolkit install` w root BET.

## Referencje

- Badania: `context/changes/shared-ai-registry/research.md`
- Szablony M5L4: `.omp/configs/m5l4-github-packages-*`
- Istniejące reguły: `AGENTS.md`
- Lekcje zespołowe: `context/foundation/lessons.md`

## Postęp

### Faza 1: Szkielet pakietu i instalator

#### Automatyczne

- [x] 1.1 Utworzono `packages/ai-toolkit/package.json` — b999e9f
- [x] 1.2 Utworzono `packages/ai-toolkit/rules/AGENTS.md` — b999e9f
- [x] 1.3 Utworzono szablony konfiguracji — b999e9f
- [x] 1.4 Utworzono `packages/ai-toolkit/install.js` — b999e9f
- [x] 1.5 Utworzono `packages/ai-toolkit/uninstall.js` — b999e9f
- [x] 1.6 Utworzono `packages/ai-toolkit/README.md` — b999e9f
- [x] 1.7 `npm pack --dry-run` przechodzi — b999e9f
- [x] 1.8 Lokalny test install/uninstall działa — b999e9f
- [x] 1.9 `npm run lint` w root jest czyste — b999e9f

#### Ręczne

- [x] 1.10 Przegląd zawartości `rules/AGENTS.md` — b999e9f

### Faza 2: CI/CD publikacji

#### Automatyczne

- [x] 2.1 Utworzono `.github/workflows/publish-ai-toolkit.yml` — 4b17c3b
- [x] 2.2 Workflow przechodzi walidację (dry-run) — 4b17c3b

#### Ręczne

- [x] 2.3 Sprawdzenie triggera na tagi — 4b17c3b

### Faza 3: Publikacja i instalacja konsumencka

#### Automatyczne

- [x] 3.1 Tag `v0.1.1` wypchnięty — 219a9c9
- [x] 3.2 Pakiet widoczny w GitHub Packages — 219a9c9
- [x] 3.3 `npx @piotrwrotny/ai-toolkit install` kończy się kodem 0 — 219a9c9
- [x] 3.4 Manifest `.claude/.ai-toolkit-manifest.json` istnieje — 219a9c9

#### Ręczne

- [x] 3.5 Weryfikacja bloku reguł w `AGENTS.md` — 219a9c9
- [x] 3.6 Test deinstalacji — 219a9c9
- [x] 3.7 Zrzut zakładki Packages — 219a9c9

### Faza 4: Dokumentacja i dowody

#### Automatyczne

- [x] 4.1 `npm run lint` czyste — 2a93567

#### Ręczne

- [x] 4.2 Zrzuty / logi dla 10xChampion zebrane — 2a93567
- [x] 4.3 README konsumenta kompletne — 2a93567
