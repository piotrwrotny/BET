---
change_id: shared-ai-registry
title: Shared AI Registry — team AI toolkit package
status: implemented
created: 2026-07-02
updated: 2026-07-02
archived_at: null
---

## Notes

Built and published a minimal team AI toolkit package `@piotrwrotny/ai-toolkit` to GitHub Packages.
Package distributes team rules and editor/tool configs into the BET repo via an idempotent installer.
Must satisfy 10xChampion criteria: source-of-truth repo, package definition, published versions, and working install in a consumer repo.

## Evidence

- Package source: `packages/ai-toolkit/`
- Publish workflow: `.github/workflows/publish-ai-toolkit.yml`
- Successful publish run: https://github.com/piotrwrotny/BET/actions/runs/28576459187
- GitHub Packages listing: https://github.com/users/piotrwrotny/packages/npm/package/ai-toolkit
- Published versions: `0.1.0`, `0.1.1`
- Consumer install verified in BET: `npx @piotrwrotny/ai-toolkit@0.1.1 install` created the managed rules block and manifest; `uninstall` cleaned them up.
- Unit tests added: `packages/ai-toolkit/test/install.test.js` (Node built-in test runner), run in CI before publish.

## Commit map

| Commit | Faza | Co wnosi |
|---|---|---|
| `b999e9f` | Faza 1 | Szkielet paczki: `package.json`, `rules/AGENTS.md`, szablony konfiguracji, `install.js`, `uninstall.js`, `README.md` oraz wykluczenie skryptów CJS z root ESLint. |
| `4b17c3b` | Faza 2 | Workflow GitHub Actions publikujący paczkę do GitHub Packages przy tagach `v*.*.*`. |
| `ea0e1da` | Faza 2-fix | Usunięcie walidacji znaczników sentinel z pliku reguł — instalator dodaje je sam. |
| `e039f3f` | Faza 3-prep | Zmiana scope z `@bet-team` na `@piotrwrotny` — GitHub Packages wymaga zgodności z właścicielem repo. |
| `2686016` | Porządki | Usunięcie z indeksu plików `.omp/config-templates/` i `.omp/configs/` (pozostawione jako untracked lokalnie). |
| `219a9c9` | Faza 3 | Naprawa wykrywania katalogu konsumenta przez `INIT_CWD`; wersja `0.1.1`. |
| `2a93567` | Faza 4 | Dokumentacja i dowody w `change.md`. |
| `4814084` | Epilog | Zamknięcie planu — finalne SHA w `plan.md` i status `implemented`. |
| `e42c3c8` | Follow-up | Testy jednostkowe instalatora oraz uruchamianie ich w workflow przed publikacją. |
| `9e164d1` | Follow-up | Notatka o testach w `change.md`. |
