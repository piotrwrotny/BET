---
name: 10x-plan-review
description: >
  Review implementation plans for substance, feasibility, and architectural fitness.
  Use when user asks to review a plan, says "is this plan good", "check my plan",
  "review this plan", mentions plan review, or references a plan file and asks
  for feedback. Also trigger when user finishes /10x-plan and wants validation
  before starting /10x-implement.
---

# Przegląd planu

Wykryj problemy merytoryczne w planie implementacji, zanim zostanie napisana choćby jedna linia kodu. Wadliwy plan kosztuje godziny — wadliwy przegląd kosztuje minuty.

Tam, gdzie `/10x-impl-review` pyta „czy zbudowaliśmy to, co zaplanowaliśmy?”, to narzędzie pyta „czy ten plan faktycznie zadziała?”.

Dwa tryby:
- **Świeży przegląd**: analiza → ustalenia → interaktywne sortowanie
- **Wznowienie sortowania**: załaduj zapisany raport i przejdź do sortowania poszczególnych problemów

## Rozwiązanie wejściowe

1. Argument wskazuje na zapisany plik przeglądu (zawiera `<!-- PLAN-REVIEW-REPORT -->`) → **wznów sortowanie** (przejdź do kroku 6)
2. Argument to `<change-id>` i istnieje `context/changes/<change-id>/plan.md` → przejrzyj ten plan
3. Podano ścieżkę do planu (np. `@context/changes/<change-id>/plan.md`) → użyj jej
4. Brak argumentu → wyświetl listę `context/changes/*/plan.md` (najnowsze według `change.md.updated`) za pomocą pytania do użytkownika:
5. Flaga `--quick` → tryb tylko dokumentu (pominięcie kroku 3)

Jeśli rozwiązana ścieżka do planu zaczyna się od `context/archive/`, odmów zapisania przeglądu: wydrukuj "Ta zmiana jest zarchiwizowana. Przeglądy nie są dołączane do zarchiwizowanych planów." i ZATRZYMAJ.

## Krok 1: Ładowanie i skanowanie spójności wewnętrznej

W pełni przeczytaj plik planu. Przeczytaj również siostrzany plik `plan-brief.md` w tym samym folderze zmiany, jeśli istnieje. Przeczytaj `context/foundation/lessons.md`, jeśli jest obecny, i użyj zaakceptowanych reguł jako priorytetów podczas skanowania pod kątem problemów merytorycznych / wykonalności / naruszeń kontraktu — ustalenie, które powtarza znaną, powtarzającą się regułę, powinno ważyć więcej, a nie mniej. Wyodrębnij:
- **Pożądany stan końcowy** i **Kryteria sukcesu**
- **Analiza stanu bieżącego** — udokumentowane ograniczenia i pułapki
- **Granice zakresu** — „Czego NIE robimy”
- **Fazy** — ścieżki plików, zmiany, zależności
- **Decyzje** i **założenia** (jawne i niejawne)
- **Sekcja postępu** — kanoniczny blok `## Progress` na dole planu (patrz `references/progress-format.md`)

Przed jakąkolwiek weryfikacją kodu, sprawdź plan pod kątem jego własnej spójności. Te trzy skany często wychwytują najcenniejsze problemy — problemy, które autor planu odkrył, ale nie doprowadził do końca:

- **Sprzeczność**: czy analiza stanu bieżącego dokumentuje ograniczenie, które implementacja ignoruje? (np. „npm nie uruchamia preuninstall dla zależności”, a fazy na tym polegają) Czy elementy z „Czego NIE robimy” pojawiają się ponownie w fazach? Czy faza zakłada zachowanie, które gdzie indziej jest uznane za wadliwe?
- **Luka w obietnicy**: każda zdolność obiecana w Pożądanym Stanie Końcowym / Kryteriach Sukcesu / Notatkach Migracyjnych powinna mieć wspierającą fazę. Jeśli kryteria sukcesu mówią „ograniczenie szybkości działa”, ale żadna faza tego nie buduje, implementator napotka lukę w trakcie budowy.
- **Naruszenia kontraktu** (gdy plan definiuje lub używa punktów końcowych API): śledź przepływ danych przez punkty końcowe — jeśli krok B potrzebuje tokena/ID z kroku A, czy odpowiedź A go zawiera? Oznacz nierozwiązane decyzje projektowe, które implementator musiałby zgadywać (który punkt końcowy, która metoda uwierzytelniania, które miejsce przechowywania stanu ograniczenia szybkości).
- **Dotknięte powierzchnie kontraktu**: jeśli `docs/reference/contract-surfaces.md` istnieje w projekcie, przeczytaj go i wyodrębnij listę nagłówków H2 jako nazwy powierzchni. Uruchom `grep -F` na tekście planu z jednym `-e <surface name>` na nagłówek. Dla każdego trafienia, przeczytaj odpowiednią sekcję H2 `contract-surfaces.md` i zweryfikuj (a) czy plan dokładnie raportuje aktualny kształt powierzchni, oraz (b) czy jakakolwiek zmiana nazwy lub schematu jest oznaczona jako łamiąca z historią migracji dla konsumentów niższego poziomu. Jeśli plik nie istnieje, pomiń to sprawdzenie po cichu — jest to opcjonalna konwencja samoczynnie uruchamiana przy pierwszym użyciu przez `/10x-contract` lub gałąź sortowania `/10x-impl-review`. Lista grep pochodząca z H2 oznacza: gdy konsument dodaje nową powierzchnię do swojego pliku, następny przegląd planu automatycznie ją wychwytuje — nie jest potrzebna edycja SKILL.md.
- **Spójność Postęp↔Faza** (kontrakt mechaniczny — patrz `references/progress-format.md`):
  - Dokładnie jeden nagłówek `## Progress` na dole plan.md.
  - Każdy `## Phase N: <name>` w treści planu ma pasujący `### Phase N: <name>` w Progress.
  - Każdy punkt kryteriów sukcesu (pod `#### Automated Verification:` / `#### Manual Verification:`) w bloku fazy ma pasujący `- [ ] N.M <title>` (lub `- [x]`) w odpowiedniej podsekcji Progress.
  - Bloki fazy zawierają tylko zwykłe punkty `- ` — bez `- [ ]` lub `- [x]` poza sekcją Progress.
  Traktuj każdy z nich jako KRYTYCZNE ustalenie w ramach Kompletności Planu — `/10x-implement` nie będzie w stanie przetworzyć źle sformułowanej sekcji Progress.

## Krok 2: Ugruntowanie

Szybko, bez podagentów:
- **Ścieżki**: Wykonaj polecenie shella, aby wyświetlić pliki (`ls -l`) dla ≥5 ścieżek plików, które plan twierdzi, że modyfikuje. Nieistniejące ścieżki są krytyczne.
- **Symbole**: Wykonaj polecenie shella, aby wyszukać (`grep`) konkretne funkcje/klucze konfiguracyjne, do których odwołuje się plan.
- **Spójność brief↔plan**: czy fazy, decyzje, zakres pasują?

Raportuj w tekście: `Ugruntowanie: 5/5 ścieżek ✓, 3/3 symboli ✓, brief↔plan ✓`. Eskaluj do ustalenia tylko w przypadku niepowodzenia.

## Krok 3: Weryfikacja bazy kodu (tylko tryb głęboki)

Pomiń, jeśli `--quick`.

Z kroków 1–2 zidentyfikuj **3–5 najbardziej ryzykownych twierdzeń** w planie — rzeczy, które, jeśli są błędne, wymuszą znaczną przeróbkę. Uruchom **jednego** podagenta z trzema połączonymi zadaniami:

1. **Zweryfikuj najbardziej ryzykowne twierdzenia** w stosunku do rzeczywistego kodu. Dla każdego: co pokazuje kod, czy potwierdza, czy zaprzecza planowi, z dowodami plik:linia.
2. **Skanowanie promienia rażenia**: dla funkcji, stałych lub punktów końcowych, które plan modyfikuje, przeszukaj bazę kodu pod kątem innych wywołań/importerów niewymienionych w planie. Są to pliki, o których plan nie wie, że na nie wpływa.
3. **Sprawdzenie wzorca** (tylko jeśli plan wprowadza nowe wzorce): czy istniejące pliki w dotkniętych obszarach już to rozwiązują? Proliferacja wzorców jest częstym odkryciem.

Zadaj podagentowi ukierunkowane pytania z odpowiednimi ścieżkami plików — nie wyrzucaj całego planu. Skoncentrowane zapytanie znajduje więcej niż szerokie przeszukiwanie, ponieważ agent wie, czego szukać.

## Krok 4: Analiza merytoryczna

Przeanalizuj plan pod kątem pięciu wymiarów. Twórz ustalenia tylko dla rzeczywistych problemów — nie dodawaj „nie znaleziono problemów”.

### Zgodność ze stanem końcowym
Czy, przechodząc przez fazy sekwencyjnie, system osiąga określony stan końcowy? Czy wszystkie kryteria sukcesu mogłyby zostać spełnione, podczas gdy cel pozostaje nieosiągnięty? Czy istnieje jakaś luka „ostatniej mili”, gdzie plan wykonuje 90% i zatrzymuje się?

### Oszczędne wykonanie
Dla każdej fazy: „gdybym to usunął, czy stan końcowy nadal byłby osiągalny?” Zwróć uwagę na przedwczesną abstrakcję, dodatki „skoro już tu jesteśmy”, framework-gdzie-funkcja-by-wystarczyła, sprzeczności zakresu (elementy „nie robimy” pojawiające się w fazach).

### Dopasowanie architektoniczne
Czy to pasuje do istniejącego systemu? Nowe wzorce tam, gdzie istniejące by działały (proliferacja wzorców). Czyste granice modułów i prawidłowy kierunek zależności. Zmiany o dużym promieniu rażenia — fazy dotykające wielu plików w różnych modułach, zmiany w udostępnionych narzędziach. Niejasne „refaktoryzuj w razie potrzeby” lub „zaktualizuj odpowiednio”, które będą się rozrastać.

### Martwe punkty
Czego plan nie uwzględnił? Ścieżki błędów (opisana tylko ścieżka sukcesu?), historia wycofywania (faza 3 zawodzi — czy możemy przywrócić?), wpływ zasobów/kosztów (wywołania API, praca obliczeniowa — ile to kosztuje przy oczekiwanym użyciu?), zmiany wartości domyślnych (wartość domyślna, która potraja koszt lub czas, powinna być wyróżniona), luki w testowaniu, granice bezpieczeństwa.

### Kompletność planu
Czy dokument jest wykonalny? Czy ścieżki plików są specyficzne (nie „gdzieś w src/”)? Czy zmiany są na poziomie funkcji/metody? Czy kryteria sukcesu zawierają uruchamialne polecenia? Czy są sekcje TBD, TODO lub sekcje zastępcze?

## Krok 5: Skompiluj ustalenia

Każde ustalenie zawiera:

- **ID**: F1, F2, F3…
- **Waga**: CRITICAL / WARNING / OBSERVATION (jak źle, jeśli zignorowane)
- **Wpływ**: LOW / MEDIUM / HIGH (ile uwagi wymaga decyzja)
- **Wymiar**: jeden z End-State Alignment / Lean Execution / Architectural Fitness / Blind Spots / Plan Completeness
- **Tytuł**: jedna linia
- **Lokalizacja**: sekcja planu lub faza
- **Szczegóły**: co jest nie tak z dowodami — twierdzenie planu kontra to, co jest faktycznie prawdą, lub czego brakuje
- **Opcje naprawy**: 1 lub 2 (patrz poniżej)

### Wpływ

Ortogonalny do wagi. CRITICAL z LOW wpływem (oczywista poprawka) jest tani w rozwiązaniu; WARNING z HIGH wpływem (niejasne kompromisy, szeroki zasięg) zasługuje na dokładne przemyślenie.

| Wpływ | Znaczenie |
|---|---|
| 🏃 **LOW** | Szybka decyzja. Poprawka jest oczywista i wąsko zakrojona. Bezpieczne do grupowania. |
| 🔎 **MEDIUM** | Warto się zatrzymać. Prawdziwy kompromis lub nietrywialna edycja — pomyśl przed podjęciem decyzji. |
| 🔬 **HIGH** | Stawka architektoniczna. Szeroki promień rażenia, strategiczne implikacje lub niejasna najlepsza ścieżka. |

### Opcje naprawy

Domyślnie **jedna** poprawka. Przedstaw dwie tylko wtedy, gdy istnieje prawdziwy kompromis, który inteligentny recenzent chciałby rozważyć — nie każde ustalenie ma alternatywy warte tworzenia.

**Kiedy oferować dwie poprawki**: gdy podejście A i podejście B mają rzeczywistą zaletę, której brakuje drugiemu (np. „minimalna edycja, która łata objaw” kontra „refaktoryzacja, która usuwa klasę problemu”). Jeśli wymyślasz słabą drugą opcję, aby spełnić szablon, nie rób tego — przedstaw jedną poprawkę i przejdź dalej.

**Ustalenia o niskim wpływie**: pomiń dekompozycję — po prostu `Fix: [jedna linia]`. Hałas nie jest pomocny, gdy odpowiedź jest oczywista.

**Ustalenia o średnim/wysokim wpływie**: każda opcja otrzymuje:
```
[1-zdaniowe podejście] · Siła: [zaleta, najlepiej oparta na dowodach z planu/bazy kodu] · Kompromis: [koszt lub ryzyko] · Pewność: HIGH|MED|LOW — [1-liniowe dlaczego] · Martwy punkt: [czego nie zweryfikowaliśmy, lub "Brak znaczących"]
```

Oferując dwie opcje, oznacz dokładnie jedną `⭐ Recommended`.

### Werdykty wymiarów i ogólny werdykt

Każdy wymiar: **PASS** / **WARNING** / **FAIL**.

- **SOUND** — bezpieczne do wdrożenia. Wszystkie PASS lub PASS z drobnymi ostrzeżeniami.
- **REVISE** — wymaga ukierunkowanych poprawek. Wiele ostrzeżeń lub 1 niekrytyczny FAIL.
- **RETHINK** — fundamentalne problemy. Wiele FAIL lub błędne podejście.

Posortuj ustalenia według wagi: CRITICAL → WARNING → OBSERVATION. Ogranicz do 10 — skonsoliduj powiązane ustalenia, jeśli masz ich więcej.

## Krok 6: Przedstaw raport i zaoferuj zapisanie

Zwykły tekst, rysowanie ramek. Ustalenia pogrupowane według wagi; pomiń puste grupy. Wymiary PASS pojawiają się tylko w tabeli werdyktów, nigdy jako ustalenia.

```
═══════════════════════════════════════════════════════════
  PRZEGLĄD PLANU: [Tytuł planu]
  Tryb: Głęboki / Szybki  |  Data: RRRR-MM-DD
  Ustalenia: [N krytycznych] [N ostrzeżeń] [N obserwacji]
═══════════════════════════════════════════════════════════

  Zgodność ze stanem końcowym    PASS    ✅
  Oszczędne wykonanie         WARNING ⚠️   (1 ustalenie)
  Dopasowanie architektoniczne  PASS    ✅
  Martwe punkty            FAIL    ❌   (1 ustalenie)
  Kompletność planu      WARNING ⚠️   (1 ustalenie)

  Ugruntowanie: 5/5 ścieżek ✓, 3/3 symboli ✓, brief↔plan ✓
  ► Ogólnie: REVISE

═══════════════════════════════════════════════════════════
  KRYTYCZNE USTALENIA ❌
═══════════════════════════════════════════════════════════

  F1 — Brak wycofania dla uzupełnienia 50M wierszy
  ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
    Waga:  ❌ CRITICAL
    Wpływ:    🔬 HIGH — stawka architektoniczna; pomyśl dokładnie przed podjęciem decyzji
    Wymiar: Martwe punkty
    Lokalizacja:  Faza 3 — Zmiany w bazie danych

    Szczegóły:
    Plan dodaje kolumnę NOT NULL do użytkowników (50M wierszy), ale żadna faza
    nie obejmuje wycofania, jeśli uzupełnienie nie powiedzie się w trakcie. Częściowe uzupełnienie
    pozostawia tabelę w niespójnym stanie.

    Poprawka A ⭐ Zalecana: Uczyń kolumnę dopuszczającą wartości null + oddzielne, restartowalne uzupełnienie
      Siła:   Restartowalne; częściowy postęp nie jest destrukcyjny; pasuje do
                  wzorca użytego dla users.email_verified_at w zeszłym kwartale.
      Kompromis:   Dwa wdrożenia (dodaj nullable → uzupełnij → wymuś NOT NULL).
      Pewność: HIGH — to dokładnie podejście zostało czysto wdrożone 3 miesiące temu.
      Martwy punkt: Krok wymuszania nadal wymaga własnej notatki o wycofaniu.

    Poprawka B: Dodaj jawną fazę wycofania z pełną migawką tabeli
      Siła:   Pojedyncze wdrożenie; wycofanie jest atomowe.
      Kompromis:   Migawka 50M wierszy jest kosztowna pod względem miejsca na dysku i czasu blokady.
      Pewność: MEDIUM — nie zmierzono kosztu migawki na tabeli tej wielkości.
      Martwy punkt: Opóźnienie replikacji podczas migawki jest niezweryfikowane.

═══════════════════════════════════════════════════════════
  OSTRZEŻENIA ⚠️
═══════════════════════════════════════════════════════════

  F2 — Wzorzec dostawcy dla 2 źródeł konfiguracji
  ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
    Waga:  ⚠️ WARNING
    Wpływ:    🔎 MEDIUM — prawdziwy kompromis; zatrzymaj się, aby to przemyśleć
    Wymiar: Oszczędne wykonanie
    Lokalizacja:  Faza 1 — Refaktoryzacja konfiguracji

    Szczegóły:
    Plan buduje pełny system konfiguracji w oparciu o wzorzec dostawcy dla tylko dwóch
    źródeł (env + plik). Bezpośrednie scalenie słowników osiąga ten sam stan końcowy
    z około 1/3 kodu.

    Poprawka: Zastąp abstrakcję dostawcy konfiguracji bezpośrednim scaleniem słowników w
         load_config(). Wprowadź wzorzec dostawcy tylko wtedy, gdy pojawi się trzecie
         źródło.
      Siła:   Mniej kodu, mniej koncepcji do utrzymania.
      Kompromis:   Jeśli trzecie źródło zostanie wkrótce wdrożone, refaktoryzujemy dwukrotnie.
      Pewność: HIGH — istniejąca baza kodu wszędzie indziej stosuje ten wzorzec „dodawania abstrakcji
                  w razie potrzeby”.
      Martwy punkt: Plany dotyczące dodatkowych źródeł konfiguracji nie zostały zbadane.

  ···

  F3 — Niejasne „refaktoryzuj narzędzia w razie potrzeby”
  ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
    Waga:  ⚠️ WARNING
    Wpływ:    🏃 LOW — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
    Wymiar: Kompletność planu
    Lokalizacja:  Faza 2

    Szczegóły:
    „Refaktoryzuj format_output w razie potrzeby” — format_output jest importowany przez
    12 plików w 4 modułach. Implementator nie ma wskazówek.

    Poprawka: Określ dokładne zmiany sygnatur i wymień wywołujących wymagających aktualizacji.

═══════════════════════════════════════════════════════════
```

### Zasady formatowania raportu

- **Wiersz tytułu ustalenia** zawiera tylko ID i krótki tytuł — nic więcej. Wszystko inne znajduje się poniżej jako oznaczone pola, dzięki czemu każdy wiersz jest krótki i łatwy do przeskanowania.
- **Zawsze łącz ikony ze słowem.** Nigdy nie używaj samej ikony jako jedynego sygnału — `❌ CRITICAL`, a nie tylko `❌`. Dzięki temu raport jest czytelny podczas szybkiego przeglądania i nie zmusza użytkownika do zapamiętywania znaczenia każdej ikony.
- **Wpływ zawsze zawiera swoje jednoliniowe znaczenie** (skopiuj z tabeli Wpływ — „stawka architektoniczna; pomyśl dokładnie przed podjęciem decyzji” / „prawdziwy kompromis; zatrzymaj się, aby to przemyśleć” / „szybka decyzja; poprawka jest oczywista i wąsko zakrojona”). Dzięki temu LOW/MEDIUM/HIGH są zrozumiałe w miejscu użycia, zamiast polegać na tym, że użytkownik pamięta tabelę.
- Waga, Wpływ, Wymiar, Lokalizacja znajdują się każdy w osobnym wierszu z wyrównanymi etykietami. Szczegóły zaczynają się w osobnym wierszu pod etykietą `Detail:`, dzięki czemu mogą naturalnie zawijać się.

Następnie zapytaj:

```
question: "Przegląd planu zakończony. Jak chcesz postąpić?"
header: "Przegląd planu — [N] ustaleń"
options:
  - label: "Sortuj ustalenia"
    description: "Przejdź przez każde ustalenie i podejmij decyzję."
  - label: "Zapisz raport i posortuj później"
    description: "Zapisz pełny raport. Wznów za pomocą /10x-plan-review <ścieżka-raportu>."
  - label: "Zapisz tylko raport"
    description: "Zapisz i zakończ — sam zajmę się ustaleniami."
multiSelect: false
```

### Zapisywanie raportu

Zapisz do `context/changes/<change-id>/reviews/plan-review.md` (jeden plan-review na folder zmiany; ponowne uruchomienie nadpisuje). Zaktualizuj `change.md`: `status: plan_reviewed`, `updated: <dzisiaj>`.

```markdown
<!-- PLAN-REVIEW-REPORT -->
# Przegląd planu: [Tytuł planu]

- **Plan**: [ścieżka pliku planu]
- **Tryb**: Głęboki / Szybki
- **Data**: RRRR-MM-DD
- **Werdykt**: [SOUND/REVISE/RETHINK]
- **Ustalenia**: [N krytycznych] [N ostrzeżeń] [N obserwacji]

## Werdykty

| Wymiar | Werdykt |
|-----------|---------|
| Zgodność ze stanem końcowym | PASS/WARNING/FAIL |
| Oszczędne wykonanie | PASS/WARNING/FAIL |
| Dopasowanie architektoniczne | PASS/WARNING/FAIL |
| Martwe punkty | PASS/WARNING/FAIL |
| Kompletność planu | PASS/WARNING/FAIL |

## Ugruntowanie
[linia ugruntowania]

## Ustalenia

### F1 — Brak wycofania dla uzupełnienia 50M wierszy

- **Waga**: ❌ CRITICAL
- **Wpływ**: 🔬 HIGH — stawka architektoniczna; pomyśl dokładnie przed podjęciem decyzji
- **Wymiar**: Martwe punkty
- **Lokalizacja**: Faza 3 — Zmiany w bazie danych
- **Szczegóły**: Plan dodaje kolumnę NOT NULL do użytkowników (50M wierszy), ale żadna faza nie obejmuje wycofania, jeśli uzupełnienie nie powiedzie się w trakcie.
- **Poprawka A ⭐ Zalecana**: Uczyń kolumnę dopuszczającą wartości null + oddzielne, restartowalne uzupełnienie
  - Siła: Restartowalne; częściowy postęp nie jest destrukcyjny.
  - Kompromis: Dwa wdrożenia.
  - Pewność: HIGH — to podejście zostało czysto wdrożone w zeszłym kwartale.
  - Martwy punkt: Krok wymuszania nadal wymaga własnej notatki o wycofaniu.
- **Poprawka B**: Dodaj jawną fazę wycofania z pełną migawką tabeli
  - Siła: Pojedyncze wdrożenie; wycofanie jest atomowe.
  - Kompromis: Migawka 50M wierszy jest kosztowna pod względem miejsca na dysku i czasu blokady.
  - Pewność: MEDIUM — koszt migawki niezweryfikowany dla tej wielkości.
  - Martwy punkt: Opóźnienie replikacji podczas migawki jest niezweryfikowane.
- **Decyzja**: PENDING

### F3 — Niejasne „refaktoryzuj narzędzia w razie potrzeby”

- **Waga**: ⚠️ WARNING
- **Wpływ**: 🏃 LOW — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Kompletność planu
- **Lokalizacja**: Faza 2
- **Szczegóły**: „Refaktoryzuj format_output w razie potrzeby” — importowany przez 12 plików w 4 modułach.
- **Poprawka**: Określ dokładne zmiany sygnatur i wymień wywołujących wymagających aktualizacji.
- **Decyzja**: PENDING
```

Znacznik `<!-- PLAN-REVIEW-REPORT -->` i pola `Decision: PENDING` umożliwiają tryb wznowienia.

„Zapisz i posortuj później” → zapisz, wydrukuj ścieżkę, przypomnij o uruchomieniu `/10x-plan-review <ścieżka-zapisanego-raportu>`.
„Sortuj” → przejdź do kroku 7.

## Krok 7: Interaktywne sortowanie

### Tryb wznowienia

Jeśli wprowadzono za pomocą zapisanego pliku: przeczytaj go, przeanalizuj nagłówki `### F`, filtruj do `Decision: PENDING`. Jeśli brak, powiedz „Wszystkie ustalenia posortowane” i zatrzymaj.

### Pętla sortowania

Przejdź przez ustalenia w kolejności ważności (CRITICAL → WARNING → OBSERVATION). Dla każdego:

**Z 2 opcjami naprawy:**
```
question: "F[N] — [tytuł]\n\nWaga: [ikona wagi] [WAGA]\nWpływ: [ikona wpływu] [POZIOM] — [znaczenie]\nWymiar: [wymiar]\nLokalizacja: [lokalizacja]\n\nSzczegóły: [szczegóły]\n\n[Blok poprawki A]\n\n[Blok poprawki B]"
header: "Ustalenie [bieżące] z [całkowita pozostała liczba]"
options:
  - label: "Zastosuj poprawkę A ⭐"
    description: "[Jednoliniowy opis poprawki A]"
  - label: "Zastosuj poprawkę B"
    description: "[Jednoliniowy opis poprawki B]"
  - label: "Napraw inaczej"
    description: "Inne podejście — porozmawiajmy."
  - label: "Pomiń"
    description: "Nie warto się tym zajmować teraz."
  - label: "Akceptuj ryzyko"
    description: "Zrozumiano — zajmę się tym podczas implementacji."
  - label: "Nie zgadzam się"
    description: "To nie jest problem — odrzuć."
multiSelect: false
```

**Z 1 opcją naprawy:** te same opcje, ale zastąp „Zastosuj poprawkę A/B” pojedynczym „Napraw w planie”.

**Obsługa odpowiedzi:**
- **Zastosuj poprawkę A/B / Napraw w planie**: pokaż dokładną edycję planu (przed/po). Krótkie potwierdzenie, a następnie zastosuj edycję do pliku planu. Oznacz FIXED (zapisz, która poprawka, np. „Naprawiono za pomocą poprawki A”).
- **Napraw inaczej**: zapytaj o preferowane podejście, zastosuj edycję do pliku planu, oznacz FIXED.
- **Pomiń** → SKIPPED. **Akceptuj ryzyko** → ACCEPTED. **Nie zgadzam się** → DISMISSED. Idź dalej, nie kłóć się.

Po każdej decyzji, jeśli pracujesz z zapisanego pliku, zaktualizuj jego pole `Decision:`.

### Podsumowanie

```
═══════════════════════════════════════════════════════════
  SORTOWANIE ZAKOŃCZONE
═══════════════════════════════════════════════════════════

  Naprawiono:     F1 (Poprawka A), F3   (2)
  Pominięto:   F4               (1)
  Zaakceptowano:  F2               (1)
  Odrzucono: F5               (1)

  ► Werdykt po poprawkach: [zaktualizowany, jeśli poprawki go zmieniły, np. REVISE → SOUND]
═══════════════════════════════════════════════════════════
```

## Uwagi

- To jest umiejętność **przeglądu**. Analizuj i raportuj — nie przepisuj planu, chyba że zostaniesz o to poproszony podczas sortowania.
- Bądź konkretny. „Faza 3 wprowadza drugi system zdarzeń obok istniejącego EventBus w `src/core/events.ts`” — a nie „architektura może mieć problemy”.
- Rozróżniaj „nie zadziała” (FAIL) od „mogłoby być lepiej” (WARNING).
- Jeśli plan jest naprawdę dobry, powiedz to krótko i zakończ. Nie twórz ustaleń.
- Wpływ dotyczy **wysiłku decyzyjnego**, a nie **wagi**. Niski wpływ na krytyczne ustalenie oznacza, że poprawka jest oczywista; wysoki wpływ na ostrzeżenie oznacza, że kompromis jest realny.
- Dwie opcje naprawy tylko wtedy, gdy istnieje prawdziwy kompromis. Nie wymyślaj alternatyw dla trywialnych poprawek.
- Podczas sortowania utrzymuj tempo. Użytkownik już przeczytał raport — przedstaw ustalenie, podejmij decyzję, idź dalej.
- Podczas stosowania poprawki do planu, dokonuj minimalnych, ukierunkowanych edycji. Nie restrukturyzuj całego planu z powodu jednego ustalenia.