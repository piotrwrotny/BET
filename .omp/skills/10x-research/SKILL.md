---
name: 10x-research
description: Research codebase comprehensively using parallel sub-agents
---

# Badanie bazy kodu

Twoim zadaniem jest przeprowadzenie kompleksowego badania bazy kodu w celu udzielenia odpowiedzi na pytania użytkownika poprzez uruchomienie równoległych pod-agentów i syntezę ich ustaleń.

## Początkowa konfiguracja:

Po wywołaniu tego polecenia odpowiedz:

```
Jestem gotów do zbadania bazy kodu. Proszę podać pytanie badawcze lub obszar zainteresowania, a ja dokładnie go przeanalizuję, eksplorując odpowiednie komponenty i połączenia.
```

Następnie poczekaj na zapytanie badawcze użytkownika.

## Kroki do wykonania po otrzymaniu zapytania badawczego:

1.  **Najpierw przeczytaj wszystkie bezpośrednio wymienione pliki:**
    *   Jeśli użytkownik wspomina o konkretnych plikach (tickets, docs, JSON), przeczytaj je W CAŁOŚCI najpierw (bez limitu/offsetu)
    *   **KRYTYCZNE**: Przeczytaj te pliki samodzielnie w głównym kontekście, zanim uruchomisz jakiekolwiek podzadania
    *   Przeczytaj `context/foundation/lessons.md`, jeśli jest obecny, i traktuj jego wpisy jako znane wzorce przy kształtowaniu obszarów badawczych — powtarzające się zasady już zaakceptowane przez zespół zawężają to, co warto ponownie zbadać.

2.  **Analizuj i dekomponuj pytanie badawcze:**
    *   Rozbij zapytanie użytkownika na możliwe do skomponowania obszary badawcze
    *   Poświęć czas na dogłębne przemyślenie podstawowych wzorców, połączeń i implikacji architektonicznych, których użytkownik może szukać
    *   Zidentyfikuj konkretne komponenty, wzorce lub koncepcje do zbadania
    *   Twórz zadania badawcze, używając funkcji zarządzania zadaniami swojego asystenta kodowania AI, aby śledzić każdy obszar badawczy (pojawiają się one na pasku stanu użytkownika). Aktualizuj je w miarę ukończenia każdego obszaru.
    *   Rozważ, które katalogi, pliki lub wzorce architektoniczne są istotne

3.  **Wyjaśnij zakres badań, używając funkcji zadawania pytań asystenta AI**:

    Po dekompozycji pytania badawczego poproś użytkownika o uzgodnienie zakresu i skupienia, zanim uruchomisz pod-agentów.

    **Zasady konstruowania pytań:**
    *   Każde pytanie powinno mieć 2-4 konkretne opcje (nie ogólnikowe)
    *   Dodaj jasny `description` do każdej opcji, wyjaśniający, co oznacza dla badań
    *   Zachowaj krótki `header` (maks. 12 znaków): "Scope", "Depth", "Focus"
    *   Użytkownik zawsze może wybrać "Other" dla swobodnego wprowadzania
    *   Pomiń ten krok, jeśli zapytanie badawcze jest jednoznaczne i ściśle określone

    **O co pytać** (wybierz 1-3 na podstawie zapytania):
    *   **Zakres (Scope)**: Jak szeroko szukać — tylko ta funkcja, czy też powiązane systemy?
    *   **Głębokość (Depth)**: Powierzchowny przegląd vs. głęboka analiza architektoniczna
    *   **Obszary zainteresowania (Focus areas)**: Które konkretne aspekty są najważniejsze (wydajność, wzorce, historia, punkty integracji)
    *   **Format wyjściowy (Output format)**: Szybkie podsumowanie vs. kompleksowy dokument badawczy

    **Przykład** — dla niejednoznacznego zapytania, takiego jak "jak działa uwierzytelnianie":
    Zapytaj użytkownika:
    - "Jak głęboko powinny sięgać te badania?"
      - Opcje:
        - "Szybki przegląd": Przepływ wysokiego poziomu, kluczowe pliki, punkty wejścia. ~10 min badań.
        - "Szczegółowa analiza": Pełna architektura, przypadki brzegowe, kwestie bezpieczeństwa. Kompleksowy dokument.
        - "Konkretne pytanie": Mam skoncentrowane pytanie — wyjaśnię, czego dokładnie potrzebuję.
    - "Które aspekty są najważniejsze?"
      - Opcje:
        - "Architektura i wzorce": Jak jest zbudowana, decyzje projektowe, używane konwencje.
        - "Punkty integracji": Jak łączy się z innymi systemami, granice API, przepływ danych.
        - "Historia i ewolucja": Jak zmieniała się w czasie, wcześniejsze decyzje z `context/changes/**/` i `context/archive/**/`.

    Dla jasnego, określonego zapytania, takiego jak "znajdź wszystkie pliki używające narzędzia TaskCreate":
    *   Całkowicie pomiń zadawanie pytań — zapytanie jest jednoznaczne.

4.  **Uruchom równoległe zadania pod-agentów dla kompleksowych badań:**
    *   Stwórz wielu pod-agentów do równoczesnego badania różnych aspektów

    Użyj funkcji pod-agentów lub równoległego wykonywania zadań swojego asystenta kodowania AI:
    *   **Agent eksploracji** (`subagent_type: "Explore"`) — szybkie wyszukiwanie plików/wzorców, analiza struktury kodu. Używaj do znajdowania plików, śledzenia ścieżek kodu, wyszukiwania wzorców.
    *   **Agent ogólnego przeznaczenia** (`subagent_type: "general-purpose"`) — głęboka analiza wymagająca czytania wielu plików i wieloetapowego rozumowania. Używaj do zrozumienia złożonych systemów.

    Uruchom 2-4 agentów równolegle w jednej wiadomości dla równoczesnego wykonania:
    *   Każdy skoncentrowany na konkretnym wymiarze badawczym
    *   Żądaj konkretnych odniesień file:line w odpowiedziach
    *   Przykład: jeden Explore dla "znajdź wszystkie pliki związane z X", inny dla "znajdź wcześniejsze decyzje dotyczące Y w `context/changes/**/` i `context/archive/**/`", agent ogólnego przeznaczenia dla "analizuj, jak działa system Z"

5.  **Poczekaj na ukończenie wszystkich pod-agentów i zsyntetyzuj ustalenia:**
    *   WAŻNE: Poczekaj na ukończenie WSZYSTKICH zadań pod-agentów, zanim przejdziesz dalej
    *   Skompiluj wyniki: priorytetyzuj ustalenia z bieżącej bazy kodu, użyj `context/changes/**/` i `context/archive/**/` jako uzupełniającego kontekstu historycznego
    *   Połącz ustalenia z różnych komponentów z konkretnymi odniesieniami file:line
    *   Odpowiedz na pytania użytkownika, używając konkretnych dowodów i wzorców architektonicznych

6.  **Rozwiąż folder zmian i zbierz metadane dla dokumentu badawczego:**
    *   Określ change-id:
        *   Jeśli wywołano jako `/10x-research <change-id>` i `context/changes/<change-id>/` istnieje, użyj go.
        *   W przeciwnym razie utwórz change-id w formacie kebab-case z tematu i utwórz folder + `change.md` (odzwierciedlając semantykę `/10x-new`) przed zapisaniem.
        *   Odmów, jeśli rozwiązana ścieżka zaczyna się od `context/archive/` — wydrukuj: "Ta zmiana jest zarchiwizowana. Zamiast tego otwórz nową zmianę za pomocą `/10x-new`." i ZATRZYMAJ.
    *   Zaktualizuj `change.md`: ustaw `updated: <today>` i, tylko jeśli bieżący `status` to `new`, zmień na `status: preparing`.
    *   Nazwa pliku: `context/changes/<change-id>/research.md` (pojedynczy artefakt na zmianę).
    *   Wygeneruj metadane wymienione poniżej dla frontmattera.

7.  **Wygeneruj dokument badawczy:**
    *   Użyj metadanych zebranych w kroku 5
    *   Ustrukturyzuj dokument z frontmatterem YAML, a następnie treścią:

        ```markdown
        ---
        date: [Aktualna data i godzina ze strefą czasową w formacie ISO]
        researcher: [Imię badacza]
        git_commit: [Aktualny hash commita]
        branch: [Nazwa aktualnej gałęzi]
        repository: [Nazwa repozytorium]
        topic: "[Pytanie/Temat użytkownika]"
        tags: [research, codebase, relevant-component-names]
        status: complete
        last_updated: [Aktualna data w formacie RRRR-MM-DD]
        last_updated_by: [Imię badacza]
        ---

        # Badanie: [Pytanie/Temat użytkownika]

        **Data**: [Aktualna data i godzina ze strefą czasową z kroku 5]
        **Badacz**: [Imię badacza]
        **Git Commit**: [Aktualny hash commita z kroku 5]
        **Gałąź**: [Nazwa aktualnej gałęzi z kroku 5]
        **Repozytorium**: [Nazwa repozytorium]

        ## Pytanie badawcze

        [Oryginalne zapytanie użytkownika]

        ## Podsumowanie

        [Ustalenia wysokiego poziomu odpowiadające na pytanie użytkownika]

        ## Szczegółowe ustalenia

        ### [Komponent/Obszar 1]

        - Ustalenie z odniesieniem ([file.ext:line](link))
        - Połączenie z innymi komponentami
        - Szczegóły implementacji

        ### [Komponent/Obszar 2]

        ...

        ## Odniesienia do kodu

        - `path/to/file.py:123` - Opis tego, co się tam znajduje
        - `another/file.ts:45-67` - Opis bloku kodu

        ## Wnioski architektoniczne

        [Odkryte wzorce, konwencje i decyzje projektowe]

        ## Kontekst historyczny (z poprzednich zmian)

        [Istotne wnioski z `context/changes/**/` i `context/archive/**/` z odniesieniami]

        - `context/changes/<other-change>/plan.md` - Historyczna decyzja dotycząca X
        - `context/archive/RRRR-MM-DD-<other-change>/research.md` - Poprzednie badanie Y

        ## Powiązane badania

        [Linki do innych artefaktów badawczych w `context/changes/**/research.md` lub `context/archive/**/research.md`]

        ## Otwarte pytania

        [Wszelkie obszary wymagające dalszych badań]
        ```

8.  **Dodaj stałe linki GitHub (jeśli dotyczy):**
    *   Sprawdź, czy jesteś na gałęzi głównej lub czy commit został wypchnięty: `git branch --show-current` i `git status`
    *   Jeśli na gałęzi głównej/master lub wypchnięty, wygeneruj stałe linki GitHub:
        *   Pobierz informacje o repozytorium: `gh repo view --json owner,name`
        *   Utwórz stałe linki: `https://github.com/{owner}/{repo}/blob/{commit}/{file}#L{line}`
    *   Zastąp lokalne odniesienia do plików stałymi linkami w dokumencie

9.  **Synchronizuj i przedstaw ustalenia:**
    *   Przedstaw użytkownikowi zwięzłe podsumowanie ustaleń
    *   Dołącz kluczowe odniesienia do plików dla łatwej nawigacji
    *   Zapytaj, czy mają dodatkowe pytania lub potrzebują wyjaśnień

10. **Obsługa pytań uzupełniających:**

    *   Jeśli użytkownik ma pytania uzupełniające, dołącz je do tego samego dokumentu badawczego
    *   Zaktualizuj pola frontmattera `last_updated` i `last_updated_by`, aby odzwierciedlić aktualizację
    *   Dodaj `last_updated_note: "Dodano badania uzupełniające dla [krótki opis]"` do frontmattera
    *   Dodaj nową sekcję: `## Badania uzupełniające [znacznik czasu]`
    *   Uruchom nowych pod-agentów w razie potrzeby do dodatkowych badań
    *   Kontynuuj aktualizowanie dokumentu i synchronizowanie

## Ważne uwagi:

*   Używaj równoległych pod-agentów dla efektywności — główny agent syntetyzuje, pod-agenci wykonują głębokie czytanie
*   Monity pod-agentów powinny być specyficzne, tylko do odczytu, żądające odniesień file:line i wzorców użycia (nie tylko definicji)
*   Zawsze przeprowadzaj świeże badania bazy kodu; używaj `context/changes/**/` i `context/archive/**/` jako uzupełniającego kontekstu historycznego
*   Dokumenty badawcze powinny być samodzielne, zawierać ścieżki plików, numery linii, wzorce międzykomponentowe i kontekst czasowy
*   W miarę możliwości linkuj do stałych linków GitHub dla trwałych odniesień
*   **Określanie zakresu badań**: Poproś użytkownika o wyjaśnienie zakresu/głębokości/skupienia przed uruchomieniem agentów, chyba że zapytanie jest już ściśle określone i jednoznaczne
*   **Śledzenie postępów**: Na początku użyj funkcji zarządzania zadaniami swojego asystenta kodowania AI, aby utworzyć zadania dla obszarów badawczych, i aktualizuj je, aby oznaczyć je jako ukończone — to daje użytkownikowi widoczny postęp na pasku stanu
*   **Czytanie plików**: Zawsze czytaj wspomniane pliki W CAŁOŚCI (bez limitu/offsetu) przed uruchomieniem podzadań
*   **Krytyczna kolejność**: Dokładnie przestrzegaj ponumerowanych kroków
    *   ZAWSZE najpierw czytaj wspomniane pliki, zanim uruchomisz podzadania (krok 1)
    *   ZAWSZE czekaj na ukończenie wszystkich pod-agentów, zanim zsyntetyzujesz (krok 5)
    *   ZAWSZE zbieraj metadane przed zapisaniem dokumentu (krok 6 przed krokiem 7)
    *   NIGDY nie zapisuj dokumentu badawczego z wartościami zastępczymi
*   **Spójność frontmattera**: Zawsze dołączaj frontmatter YAML, utrzymuj spójność pól w dokumentach, używaj snake_case dla pól wielowyrazowych, aktualizuj przy dodawaniu badań uzupełniających