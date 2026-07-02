# Shared AI Registry — Krótki plan

> Pełny plan: `context/changes/shared-ai-registry/plan.md`
> Badania: `context/changes/shared-ai-registry/research.md`

## Co i dlaczego

Budujemy minimalny pakiet npm `@bet-team/ai-toolkit` publikowany do GitHub Packages, który będzie jednym źródłem prawdy dla reguł zespołowych i konfiguracji narzędzi. W wersji 0.1.0 pakiet dystrybuuje reguły z `AGENTS.md` oraz szablony konfiguracji; skille dodamy w kolejnej wersji.

## Punkt wyjścia

- BET ma ustalone reguły w `AGENTS.md` i lekcje w `context/foundation/lessons.md`, ale dystrybuowane są ręcznie/kopiowaniem.
- W repo znajdują się gotowe szablony M5L4 w `.omp/configs/` i `.omp/prompts/`.
- Mamy działający model publikacji z M5L3 (GitHub Actions + tokeny).

## Pożądany stan końcowy

- `packages/ai-toolkit/` zawiera źródło pakietu.
- Workflow publikuje pakiet do GitHub Packages po tagu `v0.1.0`.
- W BET widoczny jest pakiet w zakładce Packages i zarządzany blok reguł w `AGENTS.md`.
- Zebrane są dowody spełniające kryteria 10xChampion.

## Kluczowe podjęte decyzje

| Decyzja | Wybór | Dlaczego | Źródło |
|---|---|---|---|
| Model dystrybucji | GitHub Packages | Najniższy próg wejścia; zespół korzysta z GitHuba. | Badania |
| Scope/nazwa | `@bet-team/ai-toolkit` | Zgodne z wyborem użytkownika; krótkie i czytelne. | Użytkownik |
| Artefakty w 0.1.0 | Reguły + konfiguracja | Szybsze do zweryfikowania; skille w wersji 0.2.0. | Użytkownik |
| Źródło prawdy | `packages/ai-toolkit/` w BET | Oszczędza zakładanie nowego repo w MVP. | Plan |
| Konsument testowy | Samo repo BET | Można od razu zweryfikować instalację. | Użytkownik |
| Tryb instalacji | `npx @bet-team/ai-toolkit install` | Nie wymaga zmian w `package.json` konsumenta. | Użytkownik |
| Wersjonowanie | Ręczne tagi semver | Pełna kontrola; pasuje do małej częstotliwości zmian. | Użytkownik |
| Target reguł | `AGENTS.md` | BET używa `AGENTS.md`, nie `CLAUDE.md`. | Badania |

## Zakres

**W zakresie:**
- Szkielet pakietu npm z `package.json`, `install.js`, `uninstall.js`.
- Plik reguł `rules/AGENTS.md` i szablony konfiguracji.
- Workflow publikacji do GitHub Packages na tag `v*.*.*`.
- Publikacja `v0.1.0`.
- Instalacja/deinstalacja w BET i weryfikacja.
- Dokumentacja oraz dowody dla 10xChampion.

**Poza zakresem:**
- Osobne repo źródła prawdy.
- Skille w wersji 0.1.0.
- Semantic-release / CodeArtifact / API+CLI.
- Integracja z marketplace'ami Claude/Cursor.

## Architektura / Podejście

```
┌─────────────────────────────┐
│  packages/ai-toolkit/       │
│  ├── package.json           │
│  ├── rules/AGENTS.md        │
│  ├── config-templates/      │
│  ├── install.js             │
│  └── uninstall.js           │
└──────────┬──────────────────┘
           │ push tag v0.1.0
           ▼
┌─────────────────────────────┐
│  GitHub Packages            │
│  @bet-team/ai-toolkit@0.1.0 │
└──────────┬──────────────────┘
           │ npx install
           ▼
┌─────────────────────────────┐
│  BET (konsument)            │
│  ├── AGENTS.md (blok sentinel)│
│  └── .claude/.ai-toolkit-manifest.json │
└─────────────────────────────┘
```

## Fazy w skrócie

| Faza | Co dostarcza | Kluczowe ryzyko |
|---|---|---|
| 1. Szkielet pakietu | `packages/ai-toolkit/` z instalatorem | Instalator wykryje zły katalog projektu przy npx. |
| 2. CI/CD publikacji | Workflow na tagi semver | Błąd konfiguracji `registry-url` lub uprawnień. |
| 3. Publikacja i instalacja | Pakiet 0.1.0 w rejestrze + test w BET | Problemy z autoryzacją do odczytu pakietu. |
| 4. Dokumentacja i dowody | README, zrzuty, logi | Brak screenshotów / logów dla odznaki. |

**Wymagania wstępne:** Dostęp do repo `piotrwrotny/BET`, token GitHub z uprawnieniami `packages:write` oraz `packages:read`.
**Szacowany wysiłek:** Jedna sesja, 4 fazy.

## Otwarte ryzyka i założenia

- Założenie: token użytkownika ma uprawnienia do publikacji i odczytu GitHub Packages.
- Ryzyko: `npx` cache może przechowywać starą wersję pakietu; trzeba użyć `--ignore-existing` lub wyczyścić cache przy testach.
- Ryzyko: istniejący root `AGENTS.md` może być ręcznie edytowany — sentinel markers zapewniają idempotentność.

## Kryteria sukcesu (podsumowanie)

- Pakiet `@bet-team/ai-toolkit@0.1.0` opublikowany w GitHub Packages.
- Workflow publikacji zielony dla tagu `v0.1.0`.
- `npx @bet-team/ai-toolkit install` w BET tworzy zarządzany blok reguł i manifest.
- Zebrane dowody dla 10xChampion: repo/rejestr, definicja paczki, lista wersji.
