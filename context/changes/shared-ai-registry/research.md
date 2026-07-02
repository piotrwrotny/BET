---
date: 2026-07-02T00:00:00+02:00
researcher: AI Assistant
git_commit: 32b80f1
branch: module-5
repository: piotrwrotny/BET
topic: "Identify team AI artifacts to package into @bet-team/ai-toolkit and define install targets"
tags: [research, ai-toolkit, github-packages, team-rules, config]
status: complete
last_updated: 2026-07-02
last_updated_by: AI Assistant
---

# Badanie: Shared AI Registry dla zespołu BET

**Data**: 2026-07-02  
**Badacz**: AI Assistant  
**Git Commit**: [32b80f1](https://github.com/piotrwrotny/BET/commit/32b80f1)  
**Gałąź**: module-5  
**Repozytorium**: piotrwrotny/BET

## Pytanie badawcze

Jakie artefakty AI w repozytorium BET nadają się do spakowania w zespołowy pakiet `@bet-team/ai-toolkit` publikowany do GitHub Packages i gdzie powinny być zainstalowane w repo konsumenta?

## Podsumowanie

BET posiada już ustalone reguły zespołowe w `AGENTS.md` oraz zestaw konfiguracji i lekcji w `context/foundation/lessons.md`. Brakuje scentralizowanego, wersjonowanego mechanizmu dystrybucji tych reguł do kolejnych projektów zespołu. Najlepszym modelem dla tego zespołu jest **Model 1: GitHub Packages** — repozytorium źródła prawdy może być folder `packages/ai-toolkit/` w tym samym repo BET (lub osobne repo w przyszłości), a konsumentem testowym jest samo BET. Instalator powinien być idempotentny, używać znaczników sentinel w `AGENTS.md` i zapisywać manifest w `.claude/.ai-toolkit-manifest.json`.

## Szczegółowe ustalenia

### Istniejące artefakty AI do spakowania

#### 1. Reguły zespołowe (`AGENTS.md`)

Plik `AGENTS.md` zawiera twarde zasady projektu:

- No Next.js directives (`"use client"`, `"use server"`).
- Używaj `cn()` do mergowania klas Tailwind.
- React tylko dla interaktywności; Astro do layoutu i statyki.
- Handlery API: wielkie `GET`/`POST`, walidacja zod, `prerender = false`.
- RLS na każdej nowej tabeli Supabase.
- Sekrety poza kodem (`.env`, `.dev.vars`).
- Struktura katalogów (`src/pages/`, `src/components/ui/`, `src/lib/`, `src/middleware.ts`, `src/types.ts`, `supabase/migrations/`).
- Konwencje komend (`npm run dev`, `npm run lint`, `npm run typecheck`, `npm run format`).
- Zasady CI i E2E.
- Konwencje commitów (imperative present tense, no scope prefix).

Odniesienie: [`AGENTS.md:7-60`](https://github.com/piotrwrotny/BET/blob/32b80f1/AGENTS.md#L7-L60)

#### 2. Lekcje zespołowe (`context/foundation/lessons.md`)

Plik rejestruje powtarzające się wzorce i antywzorce:

- Centralizacja kontekstu (jeden root `AGENTS.md`, jeden `context/`).
- Zod v4: `z.record(z.string(), z.unknown())` zamiast `z.record(z.unknown())`.
- LF line endings na Windows przez `.gitattributes`.
- Global lint hygiene przed każdym commitem.

Odniesienie: [`context/foundation/lessons.md`](https://github.com/piotrwrotny/BET/blob/32b80f1/context/foundation/lessons.md)

#### 3. Konfiguracja środowiska deweloperskiego

Pliki, które można dołączyć jako szablony lub presety:

- `.vscode/settings.json` — ustawienia edytora.
- `.gitattributes` — LF line endings.
- `.nvmrc` — wersja Node.
- `eslint.config.js` oraz `tsconfig.json` — konfiguracja narzędzi.

Odniesienia:
- `.vscode/settings.json`
- `.gitattributes`
- `.nvmrc`
- `eslint.config.js`
- `tsconfig.json`

### Materiały startowe z kursu (M5L4)

W repo dostępne są gotowe specyfikacje i szablony:

- `.omp/prompts/m5l4-shared-conventions.md` — wspólne konwencje inżynieryjne.
- `.omp/prompts/m5l4-github-packages-spec-pack.md` — specyfikacja paczki.
- `.omp/prompts/m5l4-github-packages-spec-cicd.md` — specyfikacja CI/CD.
- `.omp/configs/m5l4-github-packages-package.json.template`
- `.omp/configs/m5l4-github-packages-install.js.template`
- `.omp/configs/m5l4-github-packages-uninstall.js.template`
- `.omp/configs/m5l4-github-packages-consumer.npmrc.template`

Te szablony będą punktem wyjścia, ale muszą zostać dostosowane:
- Scope zmieniony na `@bet-team`.
- Instalator docelowy plik reguł: `AGENTS.md` (nie `CLAUDE.md`), ponieważ BET używa `AGENTS.md`.
- Dodanie konfiguracji edytora do paczki.

## Odniesienia do kodu

- `AGENTS.md:7-60` — główne reguły zespołowe.
- `context/foundation/lessons.md` — zarejestrowane lekcje.
- `.vscode/settings.json` — ustawienia VS Code.
- `.gitattributes` — LF line endings.
- `.nvmrc` — wersja Node.
- `eslint.config.js` / `tsconfig.json` — konfiguracja narzędzi.
- `.omp/configs/*` i `.omp/prompts/m5l4-*` — szablony kursowe.

## Wnioski architektoniczne

- Pakiet powinien być **źródłem prawdy** dla reguł i konfiguracji, a nie ich kopią.
- Instalator musi być **idempotentny** i używać znaczników sentinel, aby nie nadpisywać ręcznych wpisów w `AGENTS.md`.
- Manifest `.claude/.ai-toolkit-manifest.json` zapewnia czystą deinstalację.
- Publikacja przez GitHub Actions z `GITHUB_TOKEN` — zero długożyjących sekretów po stronie wydawcy.
- Odczyt w CI konsumenta wymaga długożyjącego `GH_PKG_TOKEN`, chyba że konsument jest w tej samej organizacji GitHub.

## Kontekst historyczny

- `context/changes/ci-cd-code-review/` — wcześniejsza praca z AI review pipeline (M5L3), która zakończyła się zielonym runem na GitHub Actions. Doświadczenie z tokenami i workflowami można wykorzzywać przy publikacji pakietu.
- `context/archive/2026-06-13-bootstrap-verification/` — weryfikacja początkowego setupu projektu; pokazuje, że BET używa Cloudflare + Supabase, co ma wpływ na sposób przechowywania sekretów.

## Otwarte pytania

1. Czy pakiet powinien być publikowany z każdym push do `master`/`dev`, czy tylko ręcznie/z tagiem?
2. Czy konsument testowy (BET) powinien instalować pakiet jako zwykłą zależność `devDependencies`, czy przez `npx @bet-team/ai-toolkit install`?
3. Czy do pakietu dołączyć również skille (np. `code-review`) od razu, czy zacząć od reguł i konfiguracji?

## Rekomendacja

Przejść do `/10x-plan shared-ai-registry` z następującymi założeniami:
- Scope: `@bet-team`
- Nazwa pakietu: `@bet-team/ai-toolkit`
- Lokalizacja źródła prawdy: `packages/ai-toolkit/` w repo BET.
- Konsument testowy: samo repo BET.
- Artefakty startowe: reguły zespołowe (`AGENTS.md`) + konfiguracja edytora/skryptów (`package.json` helpers).
- Instalator: Node.js, idempotentny, znaczniki sentinel w `AGENTS.md`, manifest w `.claude/`.
- CI/CD: GitHub Actions publikujące do GitHub Packages przy pushu do `master`.
