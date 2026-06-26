# F-01: Model danych + role-aware RLS + seed pierwszej książki — Krótki plan

> Pełny plan: `context/changes/bet-data-foundation/plan.md`

## Co i dlaczego

Pierwszy fundament BET z roadmap (F-01). Dostarcza Postgres schema + RLS + seed + typy TS, na których stoją wszystkie pionowe slice'y MVP (S-01..S-07). Bez tego — żaden slice skierowany do użytkownika nie jest planowalny. Roadmap mówi: „bez schematu i seedu żaden pionowy fragment nie jest możliwy do zaplanowania ani weryfikacji".

## Punkt wyjścia

`supabase/` ma tylko `config.toml` + `.gitignore` (PG17, `db.migrations.enabled=true`, `auth.enable_signup=true`). Zero migracji, zero seed, zero RLS, zero typów. Klient Supabase wpięty (`src/lib/supabase.ts` z `@supabase/ssr`), middleware sprawdza sesję ale nie zna roli. Stack auth (signin/signup/confirm) działa z anon keyem. CLI `supabase ^2.23.4` w devDeps. Greenfield — nic do migrowania.

## Pożądany stan końcowy

Po F-01: `npm run db:reset` aplikuje pełen schemat 8 tabel + 4 helpery RLS + view + trigger + seed (1 admin + 1 student + 1 book → 2 chapters → 5 lekcji + 4 ćwiczenia). Logowanie jako seed-student w lokalnej app pokazuje książkę na dashboardzie. `npm run db:gen-types` generuje typy TS committed do repo. RLS smoke matrix manualnie zweryfikowana. Gwiazda przewodnia S-01 (first-lesson-end-to-end) i S-05 (nawigacja + agregat) odblokowane do `/10x-plan`.

## Kluczowe podjęte decyzje

| Decyzja                          | Wybór                                                                                | Dlaczego (1 zdanie)                                                                                                         | Źródło |
| -------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ------ |
| Przechowywanie roli              | Tabela `user_roles` z FK do `auth.users`                                              | Jedno źródło prawdy w SQL, zmiana roli widoczna natychmiast bez refresh tokena, prosty wzorzec Supabase.                    | Plan   |
| Organizacja RLS                  | Helpery `SECURITY DEFINER STABLE` (`is_admin`, `has_book_access`, `has_lesson_access`, `has_exercise_access`) | DRY przez 8 tabel; polityki czytają się jak intencja; helpery cache'owane w obrębie query.                                  | Plan   |
| Kształt ćwiczeń                  | Jedna `exercises` z `type` enum + `payload jsonb` + osobna `exercise_keys` (płaska lista wariantów) | Dodanie nowego typu = nowy enum + parser w app, zero migracji; pasuje do dyskryminowanego switch model w S-06 (OQ-2).        | Plan   |
| Kształt `lesson_progress`        | Append-only `(user_id, lesson_id, completed_at)` PK kompozytowy; obecność wiersza = ukończona | Brak pola bool = niemożliwe „unfinish"; pasuje do PRD „stan ukończenia jest nieodwracalny".                                  | Plan   |
| Agregat rozdziału                | SQL VIEW `chapter_progress` agregująca przy odczycie z `lessons` + `lesson_progress` | Derived state = zawsze konsystentny z faktami; admin dodaje lekcję → rozdział wraca do „nieukończonego" poprawnie semantycznie. | Plan   |
| Egzekwowanie NFR „nieodwracalny" | Brak polityk UPDATE/DELETE w RLS na `lesson_progress`                                | Minimalne, w pełni egzekwowane przez Postgres; brak policy = brak operacji nawet z autoryzowaną sesją.                       | Plan   |
| Granularność migracji            | Pojedyncza migracja bootstrap `<timestamp>_init.sql`                                 | Atomowy rollback w razie błędu; jeden grep żeby zobaczyć cały model danych; pasuje do greenfield.                            | Plan   |
| Scope seed                       | 1 admin + 1 student + 1 book → 2 chapters z varied lekcjami (3 + 2)                  | F-01 outcome + S-01 + S-05 mogą być testowane lokalnie bez czekania na S-02 admin UI.                                       | Plan   |
| Workflow typów TS                | Ręczne `npm run db:gen-types`, plik committed do repo                                | Deterministyczne, developer-driven, brak surprise diff; future hook pre-push jeśli zapomnienia będą problemem.               | Plan   |
| Default rola na signup           | SQL trigger `AFTER INSERT ON auth.users` → wstawia `student` do `user_roles`         | Standardowy wzorzec Supabase; signup endpoint nie wymaga zmian; deterministyczne bez polegania na app discipline.            | Plan   |

## Zakres

**W zakresie:**
- Jedna migracja `supabase/migrations/<timestamp>_init.sql` (8 tabel, 4 helpery, view, trigger, RLS policies)
- `supabase/seed.sql` (1 admin + 1 student + 1 book + 2 chapters + 5 lekcji + 4 ćwiczenia + warianty)
- `src/lib/database.types.ts` (wygenerowany, committed)
- npm scripts: `db:start`, `db:stop`, `db:reset`, `db:gen-types`
- Dev runbook w README/docs + RLS matrix manualna

**Poza zakresem:**
- Ekspozycja roli w middleware (`Astro.locals.role`) — S-01
- Admin UI tworzenia treści — S-02
- Endpoint admin user management — S-03 (blocked OQ-1)
- Upload okładek (Supabase Storage) — S-02
- Walidacja Zod payload ćwiczeń — S-01/S-06/S-07
- CI auto-deploy migracji — osobna troska
- Audit log, soft-delete, password reset — non-goals MVP

## Architektura / Podejście

Trzy fazy w łańcuchu zależności. **Faza 1**: jedna migracja SQL (extensions → enums → 8 tabel z FK → indexes → 4 helpery → view → trigger → RLS enable + policies). **Faza 2**: `seed.sql` z predyktowalnymi UUID-ami i hashowanymi hasłami (`crypt('pass', gen_salt('bf'))`); trigger `handle_new_user` automatycznie nada studencki role, admin update po insercie. **Faza 3**: `npm run db:gen-types` regeneruje typy, dodanie czterech skryptów do `package.json`, krótki dev runbook + RLS verification matrix.

Klucz architektoniczny: każda polityka RLS na 6 z 8 tabel sprowadza się do `USING (public.is_admin() OR public.has_*_access(parent_id))` — DRY przez helpery. View `chapter_progress` jest SECURITY INVOKER (default Postgres) — RLS na underlying tables filtruje per-user automatycznie. Trigger `handle_new_user` (SECURITY DEFINER + `SET search_path = ''`) omija RLS na user_roles żeby wstawić default rolę dla nowo-zarejestrowanego usera.

## Fazy w skrócie

| Faza                                                                        | Co dostarcza                                                                                            | Kluczowe ryzyko                                                                                                       |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1. Schemat, helpery, view, trigger, RLS                                     | Pełen schemat SQL na czystej DB po jednym `supabase db reset`; RLS aktywny na 8 tabelach                | Subtelne błędy w SECURITY DEFINER (`SET search_path`); policy bug = cross-user data leak — RLS matrix manualnie       |
| 2. Seed data                                                                | Lokalna app pozwala zalogować się jako student/admin i zobaczyć książkę                                 | Direct insert do auth.users obchodzi standardowe checks; hasła hashowane przez pgcrypto — sprawdzić że login działa   |
| 3. Typy TS + npm scripts + RLS matrix verification                          | Typy committed; skrypty wygodnie automatyzują dev DB; matrix udokumentowana                             | Manual RLS matrix może pominąć przypadek brzegowy — wymaga dyscypliny lub future SQL test fixtures                    |

**Wymagania wstępne:** Docker zainstalowany lokalnie (Supabase CLI go wymaga); rozumienie podstaw Postgres RLS; brak zmian w stack auth (signin/signup endpoints zostają bez modyfikacji).

**Szacowany wysiłek:** F-01 to fundament — jedna sesja na fazę plus weryfikacja. Po Fazie 3 gwiazda przewodnia S-01 odblokowana.

## Otwarte ryzyka i założenia

- **Założenie**: PG17 + Supabase mają `gen_random_uuid()` jako built-in (PG13+). Jeśli wersja jest niższa — potrzebujemy `pgcrypto`. `config.toml:36` deklaruje `major_version = 17` więc OK.
- **Założenie**: Supabase Cloud (production) jeszcze nie istnieje — first `supabase db push` na production to osobna troska po MVP.
- **Ryzyko**: błąd w polityce RLS może spowodować silent data leak. Mitigation: manualna RLS verification matrix w Fazie 3; future SQL test fixtures (poza zakresem F-01).
- **Ryzyko**: `payload jsonb` w `exercises` to brak SQL-level validation — błędne JSON może wejść do bazy przez admin UI. Mitigation: Zod schema na granicy aplikacji (S-01/S-06/S-07 będą to robić).
- **Ryzyko**: zmiana decyzji modelu roli (JWT claim zamiast tabeli) wymagałaby migracji wszystkich polityk. Akceptowane — pod target_scale=small JOIN koszt jest pomijalny.

## Kryteria sukcesu (podsumowanie)

- `npm run db:reset` aplikuje migrację + seed bez błędów; `supabase status` zwraca containers Running
- Logowanie jako `student@bet.local` w lokalnej app pokazuje seedowaną książkę na dashboardzie
- RLS smoke matrix przeszła manualnie: student widzi tylko swoje rows, admin widzi wszystko, UPDATE/DELETE na lesson_progress fails przez authenticated SDK
- `npm run db:gen-types` generuje typy bez błędów; `npx tsc --noEmit` i `npm run build` przechodzą; S-01 jest planowalne przez `/10x-plan first-lesson-end-to-end`
