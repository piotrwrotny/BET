---
project: "BET — English Learning Platform"
version: 1
updated: 2026-06-30
created: 2026-06-25
prd_version: 1
main_goal: speed
top_blocker: decisions
---

# Mapa drogowa: BET — English Learning Platform

> Pochodzi z `context/foundation/prd.md` (v1) + automatycznie zbadana baza kodu (2026-06-25).
> Edytuj na miejscu; archiwizuj po zastąpieniu.
> Fragmenty poniżej są wymienione w kolejności zależności. Tabela „W skrócie" to indeks.

## Podsumowanie wizji

Student przygotowujący się do certyfikatu lub egzaminu z języka angielskiego (np. FCE, CAE, B2 First) chce przerabiać konkretny podręcznik rozdziałami — z weryfikacją odpowiedzi i widocznym śladem ukończenia — zamiast skanować PDF-y i przepisywać ćwiczenia do zeszytu. Istniejące platformy (Duolingo, Anki) zakładają model „10 minut dziennie / nauka przez powtarzanie"; BET celuje w studenta z konkretnym celem egzaminacyjnym, który siada do rozbudowanych treści i chce trasować postęp rozdział po rozdziale. Główna persona: student z dostępem do przypisanych książek; secondary persona: admin/instruktor zarządzający katalogiem treści.

## Gwiazda przewodnia

**S-01: Student kończy pierwszą lekcję od początku do końca** — minimalna pełna pętla z PRD §Success Criteria primary: zalogowany student z zaseedowaną książką otwiera lekcję, czyta tekst blog-postowy, wykonuje jedno zamknięte ćwiczenie multiple-choice (FR-022), klika „Przeczytano" (FR-015) i widzi że lekcja oznaczyła się jako ukończona. Pomyślne dostarczenie tego fragmentu dowodzi, że hipoteza Vision („student przerabia podręcznik rozdziałami z weryfikacją") działa od końca do końca.

> „Gwiazda przewodnia" w tym dokumencie oznacza najmniejszy, kompleksowy fragment, którego pomyślne dostarczenie udowodniłoby podstawową hipotezę produktu — umieszczony tak wcześnie, jak pozwalają na to Wymagania wstępne, ponieważ wszystko inne ma znaczenie tylko wtedy, gdy to działa.

## W skrócie

| ID | Change ID | Wynik (użytkownik może…) | Wymagania wstępne | Odnośniki PRD | Status |
|---|---|---|---|---|---|
| F-01 | bet-data-foundation | (fundament) schemat (książki, rozdziały, lekcje, ćwiczenia, klucze wariantowe, postęp, role) + RLS rozróżnia admin/student + seed pierwszej książki | — | NFR (postęp nie ulega utracie), Access Control, FR-006..010, FR-024 | done |
| S-01 | first-lesson-end-to-end | (gwiazda przewodnia) ukończyć pierwszą lekcję od początku do końca: czytać, wykonać multiple-choice, kliknąć „Przeczytano", zobaczyć ukończenie | F-01 | US-01, US-02, FR-011, FR-014, FR-015, FR-017, FR-022, FR-024 | done |
| S-02 | admin-content-creation | (admin) utworzyć książkę z okładką, dodać rozdziały, dodać lekcje (rich text) i dołączyć ćwiczenia z listą dopuszczalnych wariantów | F-01 | FR-006, FR-007, FR-008, FR-009, FR-010 | done |
| S-03 | admin-user-and-access-mgmt | (admin) utworzyć konto studenta i nadać/odebrać dostęp do konkretnej książki | F-01 | FR-001, FR-002, FR-003 | done |
| S-04 | student-profile-progress | (student) zobaczyć profil z listą ukończonych lekcji i procentem postępu w książce | F-01 | FR-004 | done |
| S-05 | sequential-navigation-and-chapter-completion | (student) nawigować next/prev przez lekcje, dostać agregat „rozdział ukończony" gdy wszystkie lekcje rozdziału ukończone, kliknąć „Kontynuuj naukę" trafić w pierwszą nieukończoną lekcję | F-01, S-01 | FR-012, FR-013, FR-016, FR-017 | done |
| S-06 | closed-exercises-fill-match-truefalse | (student) wykonywać trzy kolejne typy ćwiczeń zamkniętych: uzupełnianie luk, łączenie fraz, prawda/fałsz; admin dodaje je przez UI | F-01, S-01, S-02 | FR-018, FR-019, FR-023 | done |
| S-07 | sentence-transformation-and-open-ended | (student) wykonać ćwiczenie transformacji zdania z wieloma poprawnymi wariantami i otwarte pytanie z wzorcową odpowiedzią (nie blokuje ukończenia lekcji) | F-01, S-01, S-02 | FR-020, FR-021, FR-025 | done |

## Strumienie

Pomoc nawigacyjna — grupuje elementy, które dzielą łańcuch Wymagań wstępnych. Kanoniczna kolejność nadal znajduje się w grafie zależności poniżej; ta tabela to proponowana kolejność czytania w równoległych ścieżkach.

| Strumień | Temat | Łańcuch | Uwaga |
|---|---|---|---|
| B | Powierzchnia admina | `S-02` → `S-03` | Treść i zarządzanie użytkownikami. Oba slice'y są już wdrożone. |
| C | Profil studenta | `S-04` | Standalone po F-01; render postępu — drugorzędny względem main loop pod main_goal=speed. |

## Baza

Co już jest na miejscu w bazie kodu na dzień 2026-06-25 (automatycznie zbadana + potwierdzona przez użytkownika).
Fundamenty poniżej zakładają, że są one obecne i NIE odbudowują ich.

- **Frontend:** obecny — Astro 6.3.1 + React 19.2 + TypeScript 5.9 + Tailwind 4 + shadcn-style ui baseline (`package.json`, `astro.config.mjs`, `components.json`, `src/components/ui/button.tsx`); brak rich-text edytora/MDX (luka pokryta wewnątrz S-02).
- **Backend / API:** częściowy — `output: "server"` skonfigurowany (`astro.config.mjs`); tylko trasy auth (`src/pages/api/auth/{signin,signup,signout}.ts`); brak tras domenowych, brak biblioteki walidacji (`zod`/`valibot` nieobecny w deps), brak warstwy serwisowej domeny.
- **Dane:** nieobecne — `supabase/` zawiera jedynie `config.toml` + `.gitignore`; zero migracji w `supabase/migrations/`, zero `seed.sql`, zero wygenerowanych typów TypeScript bazy danych, zero polityk RLS. Klient Supabase wpięty (`src/lib/supabase.ts`).
- **Uwierzytelnianie:** częściowe — Supabase SSR client wpięty (`src/lib/supabase.ts`), middleware sprawdza sesję i chroni `/dashboard` (`src/middleware.ts`); strony i API signin/signup/confirm-email działają (`src/pages/auth/`, `src/pages/api/auth/`, `src/components/auth/`). Brak ról admin/student w sesji/lokalsach (`src/env.d.ts` definiuje tylko `Locals.user: User|null`). Brak password reset.
- **Wdrożenie / infrastruktura:** obecny — `@astrojs/cloudflare` aktywny adapter (`astro.config.mjs`), `wrangler.jsonc` z `compatibility_flags: ["nodejs_compat"]` i `observability: { enabled: true }`, `.github/workflows/ci.yml` uruchamia lint + build na push/PR do `master`. Brak kroku auto-deploy. Rekomendacja Vercel z `context/foundation/infrastructure.md` nie została zaadoptowana — migracja świadomie zaparkowana (zob. `## Zaparkowane`).
- **Obserwowalność:** częściowy — Cloudflare Workers observability włączona platformowo (`wrangler.jsonc`); brak warstwy aplikacyjnej (Sentry/pino/strukturalne logi w `src/middleware.ts`).

## Fundamenty

### F-01: Model danych + role-aware RLS + seed pierwszej książki

- **Wynik:** (fundament) tabele `user_roles` (admin|student), `user_book_access`, `books`, `chapters`, `lessons`, `exercises` z dyskryminowanym polem typu, `exercise_keys` z listą dopuszczalnych wariantów (per FR-024), `lesson_progress` (boolean nieodwracalny + timestamp) i agregaty rozdziałów są utworzone migracją SQL w `supabase/migrations/`; polityki RLS rozróżniają admin (pełny dostęp) od student (tylko własny postęp + książki z `user_book_access`); wygenerowane typy TypeScript (`supabase gen types`); `supabase/seed.sql` ładuje jednego studenta, jednego admina, jedną książkę → rozdział → lekcję → ćwiczenie multiple-choice, aby S-01 mógł zostać uruchomiony end-to-end bez UI admina.
- **Change ID:** bet-data-foundation
- **Odnośniki PRD:** Access Control (dwie role), Business Logic (boolean `lesson.completed` + agregat `chapter.completed`, nieodwracalny), NFR „postęp nie ulega utracie", FR-006..010 (kształty encji), FR-024 (lista wariantów).
- **Odblokowania:** S-01 (gwiazda przewodnia), S-02, S-03, S-04, S-05, S-06, S-07 — bez schematu i seedu żaden pionowy fragment nie jest możliwy do zaplanowania ani weryfikacji.
- **Wymagania wstępne:** —
- **Równolegle z:** —
- **Blokady:** —
- **Niewiadome:**
  - Źródło prawdy roli (custom JWT claim w Supabase Auth vs osobna tabela `user_roles` z JOIN-em w RLS) — Właściciel: tech lead w `/10x-plan`. Blokada: nie. Decyzja kształtuje wszystkie późniejsze polityki RLS.
- **Ryzyko:** wybór modelu roli (claim vs tabela) propaguje się do każdej tabeli przez RLS — błąd projektowy tutaj wymusza migrację wszystkich polityk. Plus: kształt `exercise.payload` (JSON dyskryminowany typem) musi być wystarczająco elastyczny, by zaabsorbować 6 typów z FR-018..023 bez schema breakage przy każdym nowym typie.
- **Status:** done

## Fragmenty

### S-01: Student kończy pierwszą lekcję od początku do końca (gwiazda przewodnia)

- **Wynik:** zalogowany student z zaseedowaną książką wchodzi z dashboardu w pierwszą dostępną lekcję, czyta jej treść (blog-post), wykonuje jedno ćwiczenie multiple-choice, klika „Przeczytano", widzi że lekcja oznaczyła się jako ukończona (status + zapis w `lesson_progress` jest persistentny i nieodwracalny).
- **Change ID:** first-lesson-end-to-end
- **Odnośniki PRD:** US-01, US-02, FR-011 (dashboard), FR-014 (lekcja blog-post), FR-015 (warunek ukończenia), FR-017 (widoczny status), FR-022 (multiple-choice), FR-024 (weryfikacja deterministyczna).
- **Wymagania wstępne:** F-01
- **Równolegle z:** S-02, S-04
- **Blokady:** —
- **Status:** done

> Zarchiwizowano 2026-06-29. Wdrożony w kodzie.

### S-02: Admin tworzy i porządkuje treści książki

- **Wynik:** admin loguje się, tworzy książkę z nazwą + okładką + opisem, dodaje rozdziały w kolejności, dodaje lekcje (rich text), dołącza ćwiczenia do lekcji z listą dopuszczalnych wariantów odpowiedzi — wszystko bez pisania kodu i bez wchodzenia do SQL.
- **Change ID:** admin-content-creation
- **Odnośniki PRD:** FR-006 (książka), FR-007 (rozdziały), FR-008 (lekcje), FR-009 (ćwiczenia w lekcjach), FR-010 (klucze odpowiedzi).
- **Wymagania wstępne:** F-01
- **Równolegle z:** S-01, S-04
- **Blokady:** —
- **Niewiadome:**
  - Wybór rich text edytora (Tiptap, Lexical, prosty textarea + Markdown z podglądem) — Właściciel: tech lead w `/10x-plan`. Blokada: nie.
  - Upload okładki książki (Supabase Storage vs publiczny URL na start) — Właściciel: tech lead. Blokada: nie.
- **Ryzyko:** wybór rich text edytora ma długi ogon konsekwencji (bundle size, hydration, edycja vs render), ale jest izolowany do warstwy admina — nie kontaminuje S-01 render-only path, który może czytać HTML/Markdown bez edytora.
- **Status:** done

> Wdrożony w kodzie; czeka na archiwizację.

### S-03: Admin zarządza kontami studentów i ich dostępem do książek

- **Wynik:** student samodzielnie się rejestruje; admin widuje listę oczekujących kont, akceptuje studentów i nadaje im dostęp do konkretnej książki. Może też odebrać dostęp. Student zobaczy nowo nadane książki na dashboardzie po następnym logowaniu.
- **Change ID:** admin-user-and-access-mgmt
- **Odnośniki PRD:** FR-001 (rejestracja samodzielna + oczekiwanie), FR-002 (zarządzanie kontami), FR-003 (przyznawanie/odbieranie dostępu).
- **Wymagania wstępne:** F-01
- **Równolegle z:** S-04
- **Blokady:** —
- **Niewiadome:**
- **Status:** done

> Zarchiwizowano 2026-06-29. Wdrożony w kodzie. Dawniej oznaczony jako blocked, ale OQ-1 zostało rozstrzygnięte.

### S-04: Student widzi profil z postępem

- **Wynik:** student wchodzi na swój profil, widzi listę ukończonych lekcji i procent postępu w każdej dostępnej książce. Stan jest read-only — nie ma akcji edycji postępu; awatar nice-to-have (FR-005) odłożony do parkingu.
- **Change ID:** student-profile-progress
- **Odnośniki PRD:** FR-004 (profil + postęp).
- **Wymagania wstępne:** F-01
- **Równolegle z:** S-01, S-02
- **Blokady:** —
- **Status:** done

> Wdrożony w kodzie; zarchiwizowano 2026-06-30.

### S-05: Student nawiguje sekwencyjnie i widzi ukończenie rozdziału

- **Wynik:** student używa przycisków „następna lekcja" / „poprzednia lekcja" w obrębie rozdziału i przechodzi do następnego rozdziału automatycznie; system oznacza rozdział jako ukończony gdy wszystkie jego lekcje ukończone; przycisk „Kontynuuj naukę" na dashboardzie kieruje do pierwszej nieukończonej lekcji w aktywnej książce; gdy wszystko ukończone, pokazuje komunikat „Gratulacje, książka ukończona".
- **Change ID:** sequential-navigation-and-chapter-completion
- **Odnośniki PRD:** FR-012 (Kontynuuj naukę), FR-013 (next/prev), FR-016 (agregat ukończenia rozdziału), FR-017 (widoczność statusu).
- **Wymagania wstępne:** F-01, S-01
- **Równolegle z:** S-02, S-04
- **Blokady:** —
- **Niewiadome:**
- **Status:** done

> Zarchiwizowano 2026-06-29. Wdrożony w kodzie; wszystkie ustalenia z przeglądu implementacji naprawione.

### S-06: Pozostałe ćwiczenia zamknięte — uzupełnianie luk, łączenie fraz, prawda/fałsz

- **Wynik:** student wykonuje trzy kolejne typy zamkniętych ćwiczeń wykorzystując ten sam silnik weryfikacji co S-01: uzupełnianie luk, łączenie fraz/par, prawda/fałsz; admin może je dodawać przez UI rozszerzające panel z S-02; weryfikacja deterministyczna przeciw liście wariantów z `exercise_keys`.
- **Change ID:** closed-exercises-fill-match-truefalse
- **Odnośniki PRD:** FR-018 (fill-in-blank), FR-019 (matching), FR-023 (true/false), FR-024 (weryfikacja deterministyczna, ten slice ją reużywa).
- **Wymagania wstępne:** F-01, S-01, S-02
- **Równolegle z:** S-07
- **Blokady:** —
- **Status:** done

> Wdrożony w kodzie; zarchiwizowano 2026-06-30.

### S-07: Transformacje zdań i otwarte pytania

- **Wynik:** student wykonuje ćwiczenie transformacji zdania (np. zmiana czasu/formy) z wieloma poprawnymi odpowiedziami (FR-020 + FR-024 lista wariantów); student odpowiada na otwarte pytanie po angielsku, widzi wzorcową odpowiedź do samodzielnej oceny, otwarte pytanie NIE blokuje ukończenia lekcji (FR-025).
- **Change ID:** sentence-transformation-and-open-ended
- **Odnośniki PRD:** FR-020 (transformacje), FR-021 (otwarte pytania), FR-025 (otwarte nie blokują ukończenia + wzorzec).
- **Wymagania wstępne:** F-01, S-01, S-02
- **Równolegle z:** S-06
- **Blokady:** —
- **Status:** done

> `open_ended` istnieje w schemacie i seedzie, ale wyświetla się jako placeholder z wzorcową odpowiedzią do samodzielnej oceny; nie ma interaktywnego UI. `sentence_transformation` nie ma komponentu.

## Przekazanie do backlogu

| ID mapy drogowej | Change ID | Sugerowany tytuł zadania | Gotowe do `/10x-plan` | Uwagi |
|---|---|---|---|---|
| F-01 | bet-data-foundation | yes | Pierwszy element planowania. Uruchom `/10x-plan bet-data-foundation`. |
| S-01 | first-lesson-end-to-end | no | Czeka aż F-01 będzie `done`. |
| S-02 | admin-content-creation | no | Czeka aż F-01 będzie `done`. Może iść równolegle z S-01 po F-01. |
| S-03 | admin-user-and-access-mgmt | no | OQ-1 rozstrzygnięte (self-signup + oczekiwanie). Czeka aż F-01 będzie `done`. |
| S-04 | student-profile-progress | no | Czeka aż F-01 będzie `done`. |
| S-05 | sequential-navigation-and-chapter-completion | no | Czeka aż S-01 będzie `done`. |
| S-06 | closed-exercises-fill-match-truefalse | no | Czeka aż S-01 + S-02 będą `done`. |

## Otwarte pytania dotyczące mapy drogowej

1. **Rejestracja studenta** ✅ **Rozstrzygnięte** (2026-06-26): student rejestruje się samodzielnie i czeka na przyznanie książki przez admina. Dotyczy: S-03 (FR-001, FR-002).
2. **Model pluginowy ćwiczeń** — czy każdy typ ćwiczenia to oddzielny komponent z formalnym interfejsem (plugin), czy switch na dyskryminowanym typie z JSON payload? Architektura pluginowa wg PRD jest nice-to-have; default speed: switch w v1. Właściciel: user + tech lead. Wpływa na: S-06, S-07 (FR-018..023).
3. **Płatności / dostęp do platformy** — czy platforma jest wewnętrzna (closed, tylko zaproszeni studenci kursu) czy planowane jest otwarte udostępnienie lub płatny dostęp? Właściciel: user. Wpływa na: S-03 (FR-001, FR-003) — niżej priorytetowo niż OQ-1.

## Zaparkowane

- **Fiszki (3 stosy, swipe UI, zestawy rozdziałowe)** — Dlaczego zaparkowane: PRD §Non-Goals → v2.
- **Notatki i anotacje (zaznaczanie tekstu, komentarze)** — Dlaczego zaparkowane: PRD §Non-Goals → v2.
- **Integracja LLM (feedback do otwartych odpowiedzi)** — Dlaczego zaparkowane: PRD §Non-Goals → architektura weryfikacji (FR-024/025) jest przygotowana pod adapter, ale v1 jest czysto deterministyczne.
- **System punktacji / gamifikacji / streak** — Dlaczego zaparkowane: PRD §Non-Goals.
- **Tryb offline** — Dlaczego zaparkowane: PRD §Non-Goals.
- **Aplikacja mobilna (responsywność mobile może być nice-to-have)** — Dlaczego zaparkowane: PRD §Non-Goals.
- **FR-005 awatar profilowy** — Dlaczego zaparkowane: PRD nice-to-have; pod main_goal=speed nie wchodzi w ścisłą ścieżkę funkcji koniecznych do MVP.
- **Migracja wdrożenia z Cloudflare na Vercel** — Dlaczego zaparkowane: świadoma decyzja sesji 2026-06-25. `context/foundation/infrastructure.md` udokumentował zalety Vercel (region Supabase, single-step rollback, log retention), ale repo działa na Cloudflare i migracja w MVP rozszerzyłaby zakres ponad 5-tygodniowy termin. Rozważyć po MVP.
- **Reset hasła / password recovery** — Dlaczego zaparkowane: brak wśród koniecznych FR w PRD; Supabase Auth dostarcza flow gotowy do podłączenia gdy będzie wymagany.

## Zrobione

- **F-01: Model danych + role-aware RLS + seed pierwszej książki** — Zarchiwizowano 2026-06-26 → `context/archive/2026-06-25-bet-data-foundation/`. Lekcja: —.
- **S-01: Student kończy pierwszą lekcję od początku do końca (gwiazda przewodnia)** — Zarchiwizowano 2026-06-29 → `context/archive/2026-06-25-first-lesson-end-to-end/`. Lekcja: —.
- **S-02: Admin tworzy i porządkuje treści książki** — Zarchiwizowano 2026-06-29 → `context/archive/2026-06-26-admin-content-creation/`. Lekcja: —.
- **S-03: Admin zarządza kontami studentów i ich dostępem do książek** — Zarchiwizowano 2026-06-29 → `context/archive/2026-06-26-admin-user-and-access-mgmt/`. Lekcja: —.
- **S-04: Student widzi profil z postępem** — Zarchiwizowano 2026-06-30 → `context/archive/2026-06-29-student-profile-progress/`. Lekcja: —.
- **S-06: Pozostałe ćwiczenia zamknięte — uzupełnianie luk, łączenie fraz, prawda/fałsz** — Zarchiwizowano 2026-06-30 → `context/archive/2026-06-29-closed-exercises-fill-match-truefalse/`. Lekcja: —.
- **S-05: Student nawiguje sekwencyjnie i widzi ukończenie rozdziału** — Zarchiwizowano 2026-06-29 → `context/archive/2026-06-26-sequential-navigation-and-chapter-completion/`. Lekcja: —.
- **S-07: Transformacje zdań i otwarte pytania** — Zarchiwizowano 2026-06-30 → `context/archive/2026-06-30-sentence-transformation-and-open-ended/`. Lekcja: —.
