---
name: 10x-impl-review
description: Review implementation against plan for drift, dangerous decisions, and pattern compliance
---

# Przegląd implementacji

Porównaj rzeczywistą pracę implementacyjną z oryginalnym planem, aby wychwycić odchylenia, niebezpieczne decyzje, naruszenia architektury i niewłaściwe użycie wzorców, zanim się one skumulują.

Dwie granularności:
- **Przegląd fazy**: po pojedynczej fazie — szybki, skupiony na zmianach w tej fazie
- **Pełny przegląd planu**: po wszystkich fazach — kompleksowe sprawdzenie

Dwa tryby:
- **Świeży przegląd**: analiza → ustalenia → interaktywne sortowanie
- **Wznowienie sortowania**: załadowanie zapisanego raportu i przejście do sortowania poszczególnych problemów

## Rozwiązanie wejściowe

1. Argument wskazuje na zapisany plik przeglądu (zawiera `<!-- IMPL-REVIEW-REPORT -->`) → **wznowienie sortowania** (przejdź do kroku 5)
2. Argument to `<change-id>` i istnieje `context/changes/<change-id>/plan.md` → świeży przegląd tego planu
3. Podano ścieżkę planu (np. `@context/changes/<change-id>/plan.md`) → świeży przegląd tego planu
4. Podano numer fazy (np. "phase 3") → przegląd tylko tej fazy
5. Brak argumentu → wylicz `context/changes/*/change.md`; wybierz ostatnio `updated` zmianę ze `status` w `{implementing, implemented}` i potwierdź za pomocą Zapytaj użytkownika:

Jeśli rozwiązana ścieżka planu zaczyna się od `context/archive/`, odmów: wydrukuj "This change is archived. Reviews are not appended to archived plans." i ZATRZYMAJ.

## Krok 1: Załaduj plan i wykryj zakres zmian

Utwórz zadanie o nazwie "Implementation Review" z aktywnym formularzem "Loading context"

1. **W pełni przeczytaj plik planu** — bez limitu/offsetu.
2. **Przeczytaj `context/foundation/lessons.md` jeśli istnieje** i użyj zaakceptowanych reguł jako priorytetów podczas skanowania w poszukiwaniu ustaleń — odchylenie, które narusza znaną, powtarzającą się regułę, jest silniejszym sygnałem niż ogólna uwaga stylistyczna.
3. **Przeczytaj kanoniczny stan z sekcji `## Progress` planu** (patrz `references/progress-format.md`): ukończenie = `count([x]) / count([ ] + [x])`; bieżąca faza = faza zawierająca pierwszy `- [ ]` (lub ostatnia faza, jeśli wszystkie są ukończone). Przeczytaj również sąsiedni `change.md` dla `status` i `updated`.
4. **Zakres**: żądana konkretna faza → tylko ta faza; w przeciwnym razie wszystkie fazy, których pola wyboru postępu są w pełni `[x]` (tj. ukończone fazy).
5. **Wyodrębnij** z przeglądanych faz: ścieżki plików z "Changes Required", decyzje architektoniczne, kryteria sukcesu (punkty automatyczne/ręczne w blokach faz + ich lustrzane odbicie `[ ]`/`[x]` w postępie) oraz listę "What We're NOT Doing" (bariery zakresu).
6. **Wykrywanie zakresu Git** — co faktycznie się zmieniło:
   ```bash
   PLAN_DATE="<RRRR-MM-DD z nazwy pliku>"
   git log --oneline --after="${PLAN_DATE}" -- .
   git diff --name-only $(git log --reverse --after="${PLAN_DATE}" --format="%H" | head -1)^..HEAD 2>/dev/null
   ```
   Jeśli zakres nie może być jasno określony, wróć do commitów, których komunikaty odwołują się do planu/funkcji.

Porównaj listę zmienionych plików z listą plików planu:
- **W planie ORAZ w diff** → oczekiwana zmiana, zweryfikuj, czy zawartość odpowiada intencji
- **W diff, ale NIE w planie** → nieplanowana zmiana, zbadaj i oznacz
- **W planie, ale NIE w diff** → potencjalnie brakująca implementacja

Nie wczytuj wstępnie każdego zmienionego pliku do głównego kontekstu — pozwól podagentom czytać to, czego potrzebują. Główny kontekst powinien zawierać plan i podsumowanie diff, a nie pełne źródło 20 plików.

## Krok 2: Równoległy przegląd za pomocą podagentów

Zaktualizuj aktywny formularz zadania na "Gathering evidence"

Uruchom **dwa** podagenty jednocześnie. Każdy otrzymuje ukierunkowany kontekst — nie wrzucaj pełnego planu do obu.

**Agent 1 — Wykrywanie odchyleń od planu** (`subagent_type: "general-purpose"`)

Daj mu: tekst "Changes Required" dla przeglądanych faz, listę ścieżek plików do odczytania.

Instrukcje: dla każdej zaplanowanej zmiany, przeczytaj rzeczywisty plik i zweryfikuj, czy implementacja odpowiada intencji. Sprawdź:
- Zmiany zaimplementowane inaczej niż planowano (niezgodność intencji, nie formatowania)
- Zaplanowane elementy pominięte bez dokumentacji
- Dodatki nieopisane w planie (rozszerzenie zakresu)

Zgłoś każdy: ścieżkę pliku, co mówił plan, co istnieje, werdykt (MATCH / DRIFT / MISSING / EXTRA).

**Agent 2 — Bezpieczeństwo, jakość i zgodność ze wzorcami** (`subagent_type: "general-purpose"`)

Daj mu: pełną listę zmienionych plików do odczytania, ścieżkę katalogu głównego projektu.

Instrukcje:

1. **Skanowanie bezpieczeństwa i jakości** na każdym zmienionym pliku. Oznacz:
   - **Bezpieczeństwo**: ryzyka iniekcji (SQL, polecenia, XSS), zakodowane na stałe sekrety, brak autentykacji/autoryzacji na granicach systemu, zbyt liberalne CORS/uprawnienia.
   - **Wydajność**: zapytania N+1, nieograniczone iteracje/rekurencje, brak paginacji, niepotrzebne synchroniczne I/O.
   - **Niezawodność**: brak obsługi błędów na zewnętrznych granicach (wywołania API, I/O plików, DB), warunki wyścigu, wycieki zasobów.
   - **Bezpieczeństwo danych**: destrukcyjne operacje DB bez możliwości wycofania, zmiany schematu bez ścieżki migracji, potencjalna utrata danych.

2. **Zgodność ze wzorcami** — dla każdego zmienionego pliku znajdź 1–2 podobne istniejące pliki i porównaj nazewnictwo, podejście do obsługi błędów, strukturę modułów, importy/eksporty, strukturę testów, wzorce konfiguracji. **Zgłaszaj tylko istotne niezgodności** (np. nowy moduł używa camelCase, gdzie sąsiednie używają snake_case; nowy punkt końcowy pomija wzorzec middleware autoryzacji, którego używa reszta API). Pomiń trywialne różnice stylistyczne — jeśli kod działa i jest zgodny z planem, drobne formatowanie nie jest ustaleniem.

3. **Budżetowanie pracy nad wzorcami w zależności od zakresu** — jeśli diff zmienił ≤3 pliki, poświęć minimalny czas na wzorce (niewiele do porównania). Skaluj głębokość wzorców wraz z zakresem zmian.

Zgłoś każde ustalenie z: plikiem, numerem linii, kategorią, ważnością (CRITICAL / WARNING / OBSERVATION), opisem, rekomendacją.

## Krok 3: Zweryfikuj kryteria sukcesu

Zaktualizuj aktywny formularz zadania na "Verifying success criteria"

Dla każdej przeglądanej fazy:

**Automatyczne**: uruchom każde polecenie z pól wyboru "Automated Verification" za pomocą powłoki bash. Zapisz polecenie, wynik (pass/fail), rzeczywiste wyjście (obetnij, jeśli jest ogromne).

**Ręczne**: w sekcji `## Progress` sprawdź elementy ręczne jako `- [x]` vs `- [ ]`. Oznacz elementy oznaczone jako ukończone, które nie mają widocznych dowodów w diff (możliwe "podpisywanie na ślepo"); uznaj niezaznaczone elementy jako oczekujące.

## Krok 4: Skompiluj ustalenia i przedstaw raport

Zaktualizuj aktywny formularz zadania na "Compiling findings"

Każde ustalenie ma:
- **ID**: F1, F2, F3…
- **Ważność**: CRITICAL / WARNING / OBSERVATION (jak źle, jeśli zignorowane)
- **Wpływ**: LOW / MEDIUM / HIGH (ile uwagi wymaga decyzja)
- **Wymiar**: Plan Adherence / Scope Discipline / Safety & Quality / Architecture / Pattern Consistency / Success Criteria
- **Tytuł**: jedna linia
- **Lokalizacja**: `plik:linia` (lub "N/A" dla brakujących elementów)
- **Szczegóły**: co jest nie tak z dowodami — plan vs. rzeczywistość, lub kod vs. oczekiwania
- **Opcje naprawy**: 1 lub 2 (patrz poniżej)

### Wpływ

Ortogonalny do ważności. CRITICAL z LOW wpływem (oczywista jednowierszowa poprawka) jest tania; WARNING z HIGH wpływem (przebudowa architektury) wymaga starannego przemyślenia.

| Wpływ | Znaczenie |
|---|---|
| 🏃 **LOW** | Szybka decyzja. Poprawka jest oczywista i wąsko zakrojona. Bezpieczna do grupowania. |
| 🔎 **MEDIUM** | Warto się zatrzymać. Prawdziwy kompromis lub nietrywialna edycja — pomyśl przed podjęciem decyzji. |
| 🔬 **HIGH** | Stawka architektoniczna. Szeroki promień rażenia, strategiczne implikacje lub niejasna najlepsza ścieżka. |

### Opcje naprawy

Domyślnie **jedna** poprawka. Oferuj dwie tylko wtedy, gdy istnieje prawdziwy kompromis, który inteligentny recenzent chciałby rozważyć (np. "załataj miejsce wywołania" vs. "napraw to u źródła"). Jeśli wymyślasz słabą drugą opcję, nie rób tego — przedstaw jedną i idź dalej.

**Ustalenia o niskim wpływie**: tylko `Fix: [jedna linia]`. Hałas nie jest pomocny, gdy odpowiedź jest oczywista.

**Ustalenia o średnim/wysokim wpływie**: każda opcja otrzymuje:
```
[1-zdaniowe podejście] · Siła: [zaleta, najlepiej oparta na dowodach z kodu/planu] · Kompromis: [koszt lub ryzyko] · Pewność: HIGH|MED|LOW — [1-liniowe dlaczego] · Martwy punkt: [czego nie zweryfikowaliśmy, lub "None significant"]
```

Oferując dwie opcje, oznacz dokładnie jedną `⭐ Recommended`.

### Werdykty wymiarów

PASS / WARNING / FAIL na wymiar:
- **Plan Adherence** — zaplanowane zmiany zaimplementowane zgodnie z opisem? FAIL w przypadku MISSING lub poważnego DRIFT.
- **Scope Discipline** — granice "nie robienia" przestrzegane? WARNING, jeśli istnieją EXTRA zmiany, ale są nieszkodliwe.
- **Safety & Quality** — bezpieczeństwo, wydajność, niezawodność, bezpieczeństwo danych. FAIL w przypadku każdego ustalenia CRITICAL.
- **Architecture** — granice modułów, kierunek zależności, uzasadnienie abstrakcji. FAIL w przypadku naruszeń.
- **Pattern Consistency** — zgodność z istniejącymi konwencjami. WARNING w przypadku drobnych niespójności.
- **Success Criteria** — automatyczne testy przechodzą, ręczne testy zaadresowane. FAIL w przypadku automatycznych błędów.

### Ogólny werdykt

- **APPROVED** — wszystkie PASS, lub PASS z ≤2 drobnymi ostrzeżeniami
- **NEEDS ATTENTION** — wiele ostrzeżeń lub 1 niekrytyczny FAIL
- **REJECTED** — każdy krytyczny FAIL (bezpieczeństwo, poważne odchylenie, bezpieczeństwo danych, nieudane testy)

Sortuj ustalenia według ważności: CRITICAL → WARNING → OBSERVATION. Ogranicz do 10 — skonsoliduj powiązane ustalenia, jeśli jest ich więcej.

### Format raportu

Zwykły tekst, rysowanie ramek. Wymiary PASS pojawiają się tylko w tabeli werdyktów, nigdy jako ustalenia. Pomiń grupy ważności z zerową liczbą ustaleń.

```
═══════════════════════════════════════════════════════════
  IMPLEMENTATION REVIEW: [Tytuł planu]
  Zakres: Faza [N] z [Całkowita]  |  Data: RRRR-MM-DD
  Ustalenia: [N krytycznych] [N ostrzeżeń] [N obserwacji]
═══════════════════════════════════════════════════════════

  Zgodność z planem        PASS    ✅
  Dyscyplina zakresu      WARNING ⚠️   (1 ustalenie)
  Bezpieczeństwo i jakość      FAIL    ❌   (1 ustalenie)
  Architektura          PASS    ✅
  Spójność wzorców   WARNING ⚠️   (1 ustalenie)
  Kryteria sukcesu      PASS    ✅

  ► Ogólnie: WYMAGA UWAGI

═══════════════════════════════════════════════════════════
  KRYTYCZNE USTALENIA ❌
═══════════════════════════════════════════════════════════

  F1 — Wstrzyknięcie SQL w obsłudze autoryzacji
  ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
    Ważność:  ❌ CRITICAL
    Wpływ:    🔎 MEDIUM — prawdziwy kompromis; zatrzymaj się, aby to przemyśleć
    Wymiar: Bezpieczeństwo i jakość
    Lokalizacja:  src/auth/handler.ts:42

    Szczegóły:
    Zapytanie SQL zbudowane z konkatenacji ciągów. Plan określał
    zapytania parametryzowane, ale implementacja używa literałów szablonowych.

    Poprawka: Zastąp literał szablonowy zapytaniem parametryzowanym używając
         db.query($1, [value]).
      Siła:   Pasuje do wzorca w src/users/query.ts i całkowicie usuwa
                  klasę wstrzyknięcia.
      Kompromis:   Drobny — jedno miejsce wywołania, zmiana kilku linii.
      Pewność: HIGH — identyczny wzorzec używany gdzie indziej w tym repozytorium.
      Martwy punkt: Brak znaczących.

═══════════════════════════════════════════════════════════
  OSTRZEŻENIA ⚠️
═══════════════════════════════════════════════════════════

  F2 — Nieplanowany punkt końcowy /api/status
  ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
    Ważność:  ⚠️ WARNING
    Wpływ:    🔬 HIGH — stawka architektoniczna; pomyśl dokładnie przed podjęciem decyzji
    Wymiar: Dyscyplina zakresu
    Lokalizacja:  src/api/routes.ts:18

    Szczegóły:
    Nowy punkt końcowy GET /api/status nie jest w planie. Funkcjonalność jest
    związana z planowaną pracą, ale rozszerza publiczną powierzchnię API.

    Poprawka A ⭐ Zalecana: Udokumentuj w planie jako dodatek
      Siła:   Zachowuje już wykonaną pracę; aktualizuje źródło
                  prawdy, zanim przyszłe przeglądy użyją planu jako podstawy.
      Kompromis:   Plan staje się nieco ruchomym celem.
      Pewność: HIGH — aktualizacje planu tego repozytorium regularnie uwzględniają
                  odkryty zakres poprzez dodatki.
      Martwy punkt: Zainteresowane strony, które przeglądały oryginalny zakres, nie są
                  powiadamiane.

    Poprawka B: Usuń i dodaj do prac uzupełniających
      Siła:   Utrzymuje ścisłą dyscyplinę zakresu.
      Kompromis:   Traci zaimplementowaną pracę; później potrzebny jest kolejny PR.
      Pewność: MEDIUM — zależy, czy coś już od tego zależy.
      Martwy punkt: Nie sprawdzono wywołań /api/status.

  ···

  F3 — camelCase vs. snake_case
  ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
    Ważność:  ⚠️ WARNING
    Wpływ:    🏃 LOW — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
    Wymiar: Spójność wzorców
    Lokalizacja:  src/utils/format.ts

    Szczegóły:
    Używa camelCase (formatDate, parseInput), podczas gdy istniejące narzędzia używają
    snake_case (format_date, parse_input).

    Poprawka: Zmień nazwy eksportów na snake_case, aby pasowały do src/utils/.

═══════════════════════════════════════════════════════════
```

Po raporcie zapytaj użytkownika:

```
question: "Review complete. How would you like to proceed?"
header: "Implementation Review — [N] findings"
options:
  - label: "Triage findings"
    description: "Walk through each finding and decide."
  - label: "Save report & triage later"
    description: "Save the full report. Resume with /10x-impl-review <report-path>."
  - label: "Save report only"
    description: "Save and finish — I'll handle the findings myself."
multiSelect: false
```

### Zapisywanie raportu

Zapisz do `context/changes/<change-id>/reviews/impl-review.md` (lub `context/changes/<change-id>/reviews/impl-review-phase-N.md` dla przeglądu ograniczonego do fazy). Zaktualizuj `change.md`: ustaw `status: impl_reviewed` i `updated: <dzisiaj>`. Jeśli użytkownik zdecyduje się na sortowanie, dodaj wszelkie dalsze działania "napraw w planie/kodzie" do `context/changes/<change-id>/follow-ups/review-fixes.md`.

```markdown
<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: [Tytuł planu]

- **Plan**: [ścieżka pliku planu]
- **Zakres**: Faza [N] z [Całkowita]
- **Data**: RRRR-MM-DD
- **Werdykt**: [APPROVED/NEEDS ATTENTION/REJECTED]
- **Ustalenia**: [N krytycznych] [N ostrzeżeń] [N obserwacji]

## Werdykty

| Wymiar | Werdykt |
|-----------|---------
| Zgodność z planem | PASS/WARNING/FAIL |
| Dyscyplina zakresu | PASS/WARNING/FAIL |
| Bezpieczeństwo i jakość | PASS/WARNING/FAIL |
| Architektura | PASS/WARNING/FAIL |
| Spójność wzorców | PASS/WARNING/FAIL |
| Kryteria sukcesu | PASS/WARNING/FAIL |

## Ustalenia

### F1 — Wstrzyknięcie SQL w obsłudze autoryzacji

- **Ważność**: ❌ CRITICAL
- **Wpływ**: 🔎 MEDIUM — prawdziwy kompromis; zatrzymaj się, aby to przemyśleć
- **Wymiar**: Bezpieczeństwo i jakość
- **Lokalizacja**: src/auth/handler.ts:42
- **Szczegóły**: Zapytanie SQL zbudowane z konkatenacji ciągów. Plan określał zapytania parametryzowane.
- **Poprawka**: Zastąp literał szablonowy zapytaniem parametryzowanym używając db.query($1, [value]).
  - Siła: Pasuje do wzorca w src/users/query.ts; usuwa klasę wstrzyknięcia.
  - Kompromis: Drobny — jedno miejsce wywołania, zmiana kilku linii.
  - Pewność: HIGH — identyczny wzorzec używany gdzie indziej.
  - Martwy punkt: Brak znaczących.
- **Decyzja**: PENDING

### F2 — Nieplanowany punkt końcowy /api/status

- **Ważność**: ⚠️ WARNING
- **Wpływ**: 🔬 HIGH — stawka architektoniczna; pomyśl dokładnie przed podjęciem decyzji
- **Wymiar**: Dyscyplina zakresu
- **Lokalizacja**: src/api/routes.ts:18
- **Szczegóły**: Nowy punkt końcowy GET /api/status nie jest w planie.
- **Poprawka A ⭐ Zalecana**: Udokumentuj w planie jako dodatek
  - Siła: Zachowuje pracę; aktualizuje źródło prawdy.
  - Kompromis: Plan staje się nieco ruchomym celem.
  - Pewność: HIGH — wzorzec dodatku używany regularnie tutaj.
  - Martwy punkt: Zainteresowane strony oryginalnego zakresu nie są powiadamiane.
- **Poprawka B**: Usuń i dodaj do prac uzupełniających
  - Siła: Utrzymuje ścisłą dyscyplinę zakresu.
  - Kompromis: Traci zaimplementowaną pracę; kolejny PR później.
  - Pewność: MEDIUM — zależy od wywołań.
  - Martwy punkt: Nie sprawdzono wywołań.
- **Decyzja**: PENDING

### F3 — camelCase vs. snake_case

- **Ważność**: ⚠️ WARNING
- **Wpływ**: 🏃 LOW — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Spójność wzorców
- **Lokalizacja**: src/utils/format.ts
- **Szczegóły**: Używa camelCase, podczas gdy istniejące narzędzia używają snake_case.
- **Poprawka**: Zmień nazwy eksportów na snake_case, aby pasowały do src/utils/.
- **Decyzja**: PENDING
```

Znacznik `<!-- IMPL-REVIEW-REPORT -->` i pola `Decision: PENDING` umożliwiają tryb wznowienia.

"Save & triage later" → zapisz, wydrukuj ścieżkę, przypomnij o uruchomieniu `/10x-impl-review <saved-report-path>`.
"Triage" → przejdź do kroku 5.

## Krok 5: Interaktywne sortowanie

Zaktualizuj aktywny formularz zadania na "Triage"

### Tryb wznowienia

Jeśli wprowadzono za pomocą zapisanego pliku: przeczytaj go, przeanalizuj nagłówki `### F`, filtruj do `Decision: PENDING`. Jeśli brak: "All findings triaged." Gotowe.

### Pętla sortowania

Przejdź przez ustalenia w kolejności ważności (CRITICAL → WARNING → OBSERVATION). Dla każdego:

**Z 2 opcjami naprawy:**
Zapytaj użytkownika:
```
question: "F[N] — [tytuł]\n\nWażność: [ikona ważności] [WAŻNOŚĆ]\nWpływ: [ikona wpływu] [POZIOM] — [znaczenie]\nWymiar: [wymiar]\nLokalizacja: [lokalizacja]\n\nSzczegóły: [szczegóły]\n\n[Blok poprawki A]\n\n[Blok poprawki B]"
header: "Ustalenie [bieżące] z [całkowita pozostała]"
options:
  - label: "Zastosuj poprawkę A ⭐"
    description: "[Jednowierszowa poprawka A]"
  - label: "Zastosuj poprawkę B"
    description: "[Jednowierszowa poprawka B]"
  - label: "Pomiń"
    description: "Nie warto teraz naprawiać."
  - label: "Zapisz jako lekcję"
    description: "Zapisz jako powtarzającą się regułę projektu za pomocą /10x-lesson."
multiSelect: false
```

**Z 1 opcją naprawy:**
Zapytaj użytkownika:
```
question: "F[N] — [tytuł]\n\nWażność: [ikona ważności] [WAŻNOŚĆ]\nWpływ: [ikona wpływu] [POZIOM] — [znaczenie]\nWymiar: [wymiar]\nLokalizacja: [lokalizacja]\n\nSzczegóły: [szczegóły]\n\n[Blok poprawki]"
header: "Ustalenie [bieżące] z [całkowita pozostała]"
options:
  - label: "Napraw teraz"
    description: "[Jednowierszowa poprawka]"
  - label: "Napraw inaczej"
    description: "Inne podejście — porozmawiajmy."
  - label: "Pomiń"
    description: "Nie warto teraz naprawiać."
  - label: "Zapisz jako lekcję"
    description: "Zapisz jako powtarzającą się regułę projektu za pomocą /10x-lesson."
multiSelect: false
```

**Obsługa odpowiedzi:**
- **Zastosuj poprawkę A/B / Napraw teraz**: pokaż dokładną zmianę kodu przed/po. Poproś o potwierdzenie ("Zastosować to?"), a następnie wykonaj edycję. Oznacz FIXED (zapisz, która opcja, np. "Fixed via Fix A").
- **Napraw inaczej**: Zapytaj użytkownika o preferowane podejście, wykonaj edycję, oznacz FIXED.
- **Zapisz jako lekcję**: wstępnie wypełnij cztery pola wpisu lekcji bezpośrednio z ustalenia — `Context` z lokalizacji ustalenia, `Problem` ze szczegółów ustalenia, `Rule` i `Applies to` pozostaw jako puste miejsca do wypełnienia przez użytkownika. Pokaż proponowany wpis jako kompletny blok markdown i poproś użytkownika o edycję / potwierdzenie za pomocą Zapytaj użytkownika: ("Zatwierdzić ten wpis?" / "Edytuj przed zapisaniem" / "Anuluj"). Po potwierdzeniu, dołącz wpis jako nową sekcję H2 do `context/foundation/lessons.md` — jeśli plik nie istnieje, utwórz go najpierw z tym kanonicznym 5-wierszowym nagłówkiem (brak oddzielnego pliku szablonu; nagłówek jest osadzony w tekście):

  ```
  # Lessons Learned

  > Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

  ```

  Przepływ wstępnego wypełniania, a następnie potwierdzania jest kluczowym elementem UX; użytkownik musi zobaczyć pełny proponowany wpis z wstępnie wypełnionym Context/Problem i mieć możliwość edycji Rule i Applies-to przed dołączeniem. Po pomyślnym dołączeniu, **zawsze** zadaj pytanie uzupełniające za pomocą Zapytaj użytkownika: "Lesson saved. Also apply the fix to the current code?" z opcjami "Yes — fix now" / "No — lesson only". **Nigdy nie pomijaj tego pytania ani nie decyduj w imieniu użytkownika** — niezależnie od tego, czy poprawka jest trywialna, poza zakresem, czy obejmuje wiele plików, decyzja należy do użytkownika. Jeśli tak: pokaż zmianę kodu przed/po, wykonaj edycję, oznacz `FIXED + ACCEPTED-AS-RULE: <tytuł reguły>`. Jeśli nie: oznacz `ACCEPTED-AS-RULE: <tytuł reguły>` (ustalenie pozostaje nienaprawione, reguła jest zapisana do przyszłej pracy).
- **Pomiń** → SKIPPED. Idź dalej, nie kłóć się.
- **Inne (dowolny tekst)**: zinterpretuj intencję użytkownika. Typowe intencje: "napraw inaczej" (zwłaszcza w kontekście podwójnej poprawki) → Zapytaj użytkownika o preferowane podejście, wykonaj edycję, oznacz FIXED; "zaakceptuj ryzyko" → oznacz ACCEPTED z uzasadnieniem użytkownika; "odrzuć"/"nie zgadzam się" → oznacz DISMISSED.

Po każdej decyzji, jeśli pracujesz z zapisanego pliku, zaktualizuj jego pole `Decision:`.

### Podsumowanie

```
═══════════════════════════════════════════════════════════
  SORTOWANIE ZAKOŃCZONE
═══════════════════════════════════════════════════════════

  Naprawiono:     F1, F2 (Poprawka A)   (2)
  Reguła:      F3 (+ naprawiono)     (1)
  Pominięto:   F4               (1)
  Zaakceptowano:  F5               (1)

═══════════════════════════════════════════════════════════
```

Jeśli istnieje zapisany raport, zaktualizuj go o ostateczne decyzje. Oznacz zadanie przeglądu jako ukończone.

## Uwagi

- To jest umiejętność **przeglądu**. Domyślnie analizuj i raportuj — dokonuj edycji tylko podczas sortowania, gdy użytkownik wyraźnie wybierze "Apply Fix" lub "Fix differently" dla konkretnego ustalenia.
- Bądź konkretny. "src/auth/handler.ts:42 — Zapytanie SQL zbudowane z konkatenacji ciągów, podatne na wstrzyknięcie" — a nie "gdzieś może być problem z bezpieczeństwem".
- Nie oznaczaj preferencji stylistycznych, chyba że mają znaczenie. Jeśli kod działa i jest zgodny z planem, drobne różnice stylistyczne od istniejącego kodu są obserwacjami, a nie ostrzeżeniami.
- Jeśli sam plan był wadliwy (np. zaplanowano niebezpieczne podejście), oznacz to — ten przegląd wychwytuje również problemy z planem.
- Wpływ dotyczy **wysiłku decyzyjnego**, a nie **ważności**. Niski wpływ na ustalenie CRITICAL oznacza, że poprawka jest oczywista; wysoki wpływ na WARNING oznacza, że kompromis jest realny.
- Dwie opcje naprawy tylko wtedy, gdy istnieje prawdziwy kompromis. Nie wymyślaj alternatyw dla trywialnych poprawek.
- Podczas przeglądania pojedynczej fazy, nadal sprawdzaj, czy zmiany z tej fazy nie naruszyły założeń poprzednich faz. Fazy mogą ze sobą współdziałać.
- Podczas sortowania, utrzymuj tempo. Użytkownik już przeczytał raport.
- Podczas naprawiania, minimalne, ukierunkowane edycje. Nie refaktoryzuj otaczającego kodu ani nie "ulepszaj" rzeczy, które nie zostały oznaczone.