---
project: "BET — English Learning Platform"
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 5
  hard_deadline: "2026-07-01"
  after_hours_only: true
created: 2026-05-23
updated: 2026-05-23
checkpoint:
  current_phase: 7
  phases_completed: [1, 2, 3, 4, 5, 6]
  gray_areas_resolved:
    - topic: "context type"
      decision: "greenfield — nowy produkt, repo ma historię git ale brak kodu aplikacji"
    - topic: "role model"
      decision: "dwie role: Admin (pełny dostęp) i Student"
    - topic: "auth method"
      decision: "e-mail + hasło"
    - topic: "mvp scope decision"
      decision: "fiszki, notatki i anotacje przesunięte do v2; MVP = książki + lekcje + ćwiczenia + tracking postępu"
    - topic: "content ownership"
      decision: "mieszane — jeden główny admin zarządza katalogiem, inni mogą dodawać treści"
    - topic: "lesson completion detection"
      decision: "student klika przycisk 'Przeczytano' — brak automatycznego wykrywania przez scroll"
    - topic: "open questions in exercises"
      decision: "otwarte pytania nie blokują ukończenia lekcji — wyświetlają wzorcową odpowiedź do samooceny"
    - topic: "multi-answer verification"
      decision: "klucz odpowiedzi to lista dopuszczalnych wariantów definiowanych przez admina"
    - topic: "continue button behavior"
      decision: "kontynuuje w aktywnej/ostatnio otwartej książce od następnej nieukończonej lekcji"
  frs_drafted: 25
  quality_check_status: accepted
---

## Vision & Problem Statement

Student przygotowujący się do certyfikatu lub egzaminu z języka angielskiego przerabia materiał z konkretnych podręczników. Dziś robi to ręcznie: skanuje PDF-y, przepisuje ćwiczenia do zeszytu, buduje fiszki we własnym zakresie — a żadna z tych czynności nie jest weryfikowana. Koszt: czas marnowany na organizację zamiast na naukę, brak informacji zwrotnej i brak śledzenia postępu.

Kluczowy insight: istniejące platformy (Duolingo, Anki) zakładają model "10 minut dziennie / nauka przez powtarzanie". Nasz użytkownik to student z konkretnym celem (egzaminem), który siada do rozbudowanych treści i chce przerabiać je zgodnie z logiką podręcznika — rozdział po rozdziale, z weryfikacją odpowiedzi i śladem ukończenia.

## User & Persona

**Główna persona:** Student przygotowujący się do egzaminu / certyfikatu językowego (np. FCE, CAE, B2 First). Pracuje z konkretnym podręcznikiem, chce przerabiać go rozdziałami, mierzyć postęp i dostać informację zwrotną od zadań.

**Moment bólu:** otwiera PDF podręcznika, widzi ćwiczenie do wypełnienia — nie ma gdzie go wykonać interaktywnie, nie dostanie oceny bez nauczyciela.

**Secondary persona:** Admin / instruktor kursu — dodaje treści (książki, rozdziały, lekcje, ćwiczenia) i nadaje studentom dostęp do konkretnych książek.

## Access Control

Dwie role:

- **Admin** — pełny dostęp: zarządzanie treściami (książki, rozdziały, lekcje, ćwiczenia), zarządzanie użytkownikami, nadawanie/odbieranie dostępu do książek.
- **Student** — dostęp tylko do przypisanych książek: czytanie lekcji, wykonywanie ćwiczeń, śledzenie własnego postępu, edycja profilu.

Autentykacja: e-mail + hasło. Rejestracja inicjowana przez admina lub samoobsługa — do ustalenia w Open Questions.

## Success Criteria

### Primary
- Student po zalogowaniu widzi swoje dostępne książki, klika "Kontynuuj naukę", trafia do lekcji gdzie skończył, czyta treść i wykonuje ćwiczenie — i widzi że lekcja / rozdział zaliczyły się w jego profilu.
- Admin może dodać książkę, rozdział, lekcję i ćwiczenie bez pisania kodu.

### Secondary
- Lekcje są wizualnie estetyczne i pomagają w przyswajaniu wiedzy.
- Ćwiczenia są płynne i przyjemne w obsłudze (UX behawioralny).

### Guardrails
- Ćwiczenia nie mogą zaliczać błędnych odpowiedzi jako poprawnych — weryfikacja deterministyczna musi być bezbłędna.
- Postęp studenta nie może zaginąć ani się zresetować.
- Dane logowania muszą być bezpiecznie przechowywane.

## Timeline acknowledgment

Acknowledged on 2026-05-23: 5-tygodniowe MVP przy ~10–12h/tydzień (2h/dzień × 5–6 dni); użytkownik zaakceptował koszt stałego zaangażowania.

## Functional Requirements

### Authentication & User Management
- FR-001: Student może zarejestrować się i zalogować przez e-mail + hasło. Priority: must-have
- FR-002: Admin może tworzyć i zarządzać kontami użytkowników. Priority: must-have
- FR-003: Admin może przyznawać lub odbierać dostęp studenta do konkretnych książek. Priority: must-have
- FR-004: Student może zobaczyć swój profil z ukończonymi lekcjami i postępem w książce. Priority: must-have
- FR-005: Student może ustawić awatar profilowy. Priority: nice-to-have

### Content Management (Admin)
- FR-006: Admin może stworzyć książkę z nazwą, okładką i opisem. Priority: must-have
- FR-007: Admin może dodawać i porządkować rozdziały w ramach książki. Priority: must-have
- FR-008: Admin może dodawać lekcje (posty blogowe z bogatym tekstem) do rozdziałów w określonej kolejności. Priority: must-have
- FR-009: Admin może dołączyć ćwiczenia do lekcji. Priority: must-have
- FR-010: Admin może definiować klucze odpowiedzi do deterministycznej weryfikacji ćwiczeń. Priority: must-have

### Learning Flow (Student)
- FR-011: Student widzi dashboard z dostępnymi dla niego książkami. Priority: must-have
- FR-012: Student może kontynuować naukę od miejsca gdzie skończył jednym kliknięciem. Priority: must-have
  > Sokrates: przy wielu książkach niejednoznaczne co kontynuować.
  > Rozwiązanie: "Kontynuuj naukę" kontynuuje w aktywnej/ostatnio otwartej książce.
- FR-013: Student może nawigować sekwencyjnie przez rozdziały i lekcje (następna/poprzednia lekcja). Priority: must-have
- FR-014: Student może czytać lekcję w formacie postu blogowego. Priority: must-have
- FR-015: System oznacza lekcję jako ukończoną gdy student kliknie przycisk "Przeczytano" ORAZ wykona poprawnie wszystkie ćwiczenia zamknięte. Ćwiczenia otwarte nie blokują zaliczenia. Priority: must-have
  > Sokrates: Scroll nie weryfikuje przeczytania — wprowadzamy przycisk "Przeczytano" jako świadome potwierdzenie.
- FR-016: System oznacza rozdział jako ukończony gdy wszystkie lekcje w nim są ukończone. Priority: must-have
- FR-017: Student może zobaczyć status ukończenia poszczególnych rozdziałów i lekcji. Priority: must-have

### Exercise Types (v1)
- FR-018: Student może wykonywać ćwiczenia z uzupełnianiem luk (fill-in-the-blank). Priority: must-have
- FR-019: Student może wykonywać ćwiczenia łączenia fraz. Priority: must-have
- FR-020: Student może wykonywać ćwiczenia przerabiania zdań (zmiana czasu/formy). Priority: must-have
- FR-021: Student może odpowiadać na otwarte pytania po angielsku. Priority: must-have
- FR-022: Student może wykonywać ćwiczenia multiple-choice. Priority: must-have
- FR-023: Student może wykonywać ćwiczenia prawda/fałsz. Priority: must-have

### Answer Verification
- FR-024: System weryfikuje odpowiedzi do ćwiczeń zamkniętych deterministycznie wg listy dopuszczalnych wariantów i pokazuje czy odpowiedź jest poprawna/błędna. Priority: must-have
  > Sokrates: Transformacje zdań mogą mieć wiele poprawnych odpowiedzi — jeden klucz nie wystarczy.
  > Rozwiązanie: klucz to lista dopuszczalnych wariantów definiowanych przez admina.
- FR-025: System przyjmuje odpowiedzi do otwartych pytań, wyświetla wzorcową odpowiedź do samodzielnej oceny i nie blokuje ukończenia lekcji. Priority: must-have
  > Sokrates: Otwarte pytania bez LLM nie pozwalają na rzetelną weryfikację.
  > Rozwiązanie: otwarte pytania nie blokują postępu — student widzi wzorzec, ocenia siebie sam.

## Business Logic

System wyznacza stan ukończenia lekcji na podstawie dwóch warunków: student nacisnął przycisk "Przeczytano" oraz wszystkie ćwiczenia zamknięte (fill-in-blank, matching, multiple-choice, true/false, transformacje zdań) zostały poprawnie odpowiedziane — otwarte pytania nie wchodzą w skład warunku zaliczenia. Gdy wszystkie lekcje rozdziału są ukończone, rozdział automatycznie przechodzi w stan "ukończony". Stan ukończenia jest nieodwracalny (nie resetuje się przy ponownym wejściu).

Dane wejściowe reguły: status "przeczytano" z klawiatury studenta (przycisk) oraz wyniki weryfikacji odpowiedzi dla każdego ćwiczenia zamkniętego w lekcji. Wynik: boolean `lesson.completed` i, agregatywnie, boolean `chapter.completed`. Student napotyka regułę jako wizualny progress indicator przy każdej lekcji i rozdziale.

## Non-Functional Requirements

- Odpowiedź platformy na akcję studenta (submit ćwiczenia, przejście do lekcji) jest widoczna w < 2 sekundy w warunkach standardowego połączenia internetowego.
- Każda operacja trwająca dłużej niż 2 sekundy wyświetla widoczny wskaźnik postępu.
- Platforma działa poprawnie na ostatnich 2 głównych wersjach Chrome, Firefox, Safari i Edge (desktop).
- Hasła użytkowników są przechowywane jako bezpieczny hash — nigdy w formie jawnej.
- Postęp studenta (ukończone lekcje, wyniki ćwiczeń) nie ulega utracie ani cofnięciu przy standardowym korzystaniu z platformy.

## User Stories

### US-01: Student kontynuuje naukę od miejsca gdzie skończył

- **Given** zalogowany student z przypisaną książką i co najmniej jedną lekcją w toku
- **When** klika "Kontynuuj naukę" na dashboardzie
- **Then** trafia bezpośrednio do pierwszej nieukończonej lekcji w bieżącym rozdziale

#### Acceptance Criteria
- Przycisk wskazuje właściwy rozdział i lekcję (nie restartuje od początku)
- Jeśli brak postępu — otwiera pierwszą lekcję pierwszego rozdziału dostępnej książki
- Jeśli wszystkie lekcje ukończone — pokazuje komunikat "Gratulacje, książka ukończona"

### US-02: Student wykonuje ćwiczenie i widzi wynik

- **Given** student otworzył lekcję z dołączonym ćwiczeniem
- **When** wypełnia odpowiedź i zatwierdza
- **Then** widzi natychmiastowy feedback: poprawna / błędna (+ wzorcowa odpowiedź dla otwartych pytań)

#### Acceptance Criteria
- Błędna odpowiedź nigdy nie jest oznaczona jako poprawna
- Po wykonaniu wszystkich ćwiczeń w lekcji + przeczytaniu treści — lekcja jest oznaczona jako ukończona

## Non-Goals (v1)

- **Brak fiszek** — system fiszek (3 stosy, swipe UI, zestawy rozdziałowe) odkładamy do v2.
- **Brak notatek i anotacji** — zaznaczanie tekstu i komentarze do v2.
- **Brak integracji LLM** — weryfikacja odpowiedzi jest deterministyczna w v1; LLM feedback na późniejszy etap.
- **Brak systemu punktacji ani gamifikacji** — platforma nie stosuje żadnego systemu nagród, poziomów ani streak.
- **Brak trybu offline** — aplikacja wymaga połączenia z internetem.
- **Brak aplikacji mobilnej** — wyłącznie web, responsywność mobile jest nice-to-have nie must-have.

## Open Questions

1. **Rejestracja studenta** — czy student rejestruje się samodzielnie i czeka na przydzielenie książek przez admina, czy admin tworzy konta ręcznie? Właściciel: user. Blokuje: FR-001, FR-002.
2. **Model pluginowy ćwiczeń** — architektura pluginowa jest nice-to-have wg użytkownika, ale bez niej dodanie nowego typu ćwiczenia wymaga zmian w kodzie. Decyzja techniczna do rozstrzygnięcia podczas wyboru stosu.
3. **Płatności / dostęp do platformy** — czy platforma jest wewnętrzna (closed, tylko zaproszeni studenci kursu) czy planowane jest otwarte udostępnienie lub płatny dostęp? Właściciel: user. Wpływa na FR-001, FR-003.

*(Rozwiązane w trakcie sesji: "przeczytana lekcja" → przycisk "Przeczytano"; otwarte pytania → nie blokują ukończenia lekcji)*

## Forward: tech-stack

*(Notatki do etapu wyboru stosu — nie są częścią PRD)*
- Treści lekcji mają być w formacie blog-post z bogatym formatowaniem — rozważyć MDX lub rich text editor (np. Tiptap, Lexical).
- Ćwiczenia w modelu pluginowym — potencjalny wzorzec: każdy typ ćwiczenia jako oddzielny komponent/moduł z interfejsem.
- Weryfikacja deterministyczna jest krytyczna — model danych musi separować treść ćwiczenia od klucza odpowiedzi.
- LLM integracja planowana w v2 — architektura weryfikacji powinna to przewidywać (adapter/strategy pattern).
