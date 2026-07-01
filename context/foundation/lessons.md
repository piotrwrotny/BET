# Lessons Learned

## Context architecture — stay centralized

- **Context**: Module 4, lesson 1 — scaling context for AI in the BET repo.
- **Problem**: A monolithic `AGENTS.md` pushes out the current task, dilutes hints, rots, and makes verification hard. The opposite mistake is adding per-module `AGENTS.md` or nested `context/` folders before the project really needs them.
- **Rule**: Keep one root `AGENTS.md` as a concise map (well below ~200 lines; split only above ~300 lines) and a centralized `context/` directory (`foundation/`, `changes/<id>/`, `archive/`). Add per-module `AGENTS.md` or a module-level `context/` only when there is a real signal: root file is too large, agent repeatedly fails in that module, or the module gets its own deploy/owner/team.
- **Applies to**: All future context decisions in this repo.

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Zod v4 record schema

- **Context**: `src/pages/api/admin/exercises/index.ts`, `src/pages/api/admin/exercises/[id].ts`
- **Problem**: `z.record(z.unknown())` użyte do walidacji `exercise.payload` jest niepoprawne w zod v4 — zgłasza `TS2554: Expected 2-3 arguments, but got 1`. Plan zakładał starszy zapis, który nie działa w aktualnej wersji.
- **Rule**: W zod v4 zawsze podawaj dwa argumenty w `z.record()`: `z.record(z.string(), z.unknown())` lub użyj `z.object({...}).passthrough()` dla dyskryminowanych payloadów JSONB.
- **Applies to**: Wszystkie API routes walidujące payloady / obiekty JSONB.

## LF line endings on Windows

- **Context**: Globalne `npm run lint` zgłaszało setki błędów `prettier/prettier` typu `Delete ␍`.
- **Problem**: `core.autocrlf=true` konwertuje LF na CRLF w working tree na Windows, a
  Prettier/ESLint wymagają LF. Formatowanie każdego pliku osobno nie rozwiązuje
  przyczyny.
- **Rule**: Dodaj `.gitattributes` z `* text=auto` i jawne mapowanie rozszerzeń na
  `text eol=lf`, następnie wykonaj `git rm --cached -r . && git reset --hard` lub
  `git add --renormalize .`, aby wymusić LF w całym drzewie roboczym.
- **Applies to**: Każdy projekt rozwijany na Windows z Prettierem/ESLintem.

## Global lint hygiene

- **Context**: `src/test-eslint.tsx`, nieużywana funkcja `listAllAuthUsersWithEmail`,
  ostrzeżenia `no-console`, przestarzałe `z.string().url()` w Zod v4.
- **Problem**: Akumulacja błędów lint i plików testowych sprawia, że nowe zmiany
  giną w szumie, a CI przestaje być zaufane.
- **Rule**: Przed każdym commitem uruchamiaj `npm run lint` dla całego repo (nie
  tylko dotkniętych plików). Nie zostawiaj plików typu `test-eslint` w `src`.
  Niepublikowanych kontraktów nie wyrażaj przez `ReturnType<typeof fn>` — użyj
  nazwanego typu w module właściciela.
- **Applies to**: Wszystkie PR-y; szczególnie zmiany w admin API i skryptach seed.
