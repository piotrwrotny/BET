# Plan walidacji Mom Test

## Pomysł wejściowy

Wspólny rejestr artefaktów AI (reguły, skille, prompty) dla projektów kursowych i zespołowych, zamiast ręcznego kopiowania `AGENTS.md`, `.cursorrules`, `CLAUDE.md` i plików skilli między repozytoriami.

## Hipotezy

- **Użytkownik/rola**:
  - Osoba utrzymująca reguły AI w projekcie (tech lead, właściciel konwencji AI).
  - Osoba wchodząca do nowego projektu i kopiująca reguły ze starego.
- **Tarcie**: Ręczne kopiowanie artefaktów AI między repo prowadzi do rozdźwięku wersji, zapomnianych aktualizacji i powtarzalnej pracy przy każdym nowym projekcie.
- **Obecne obejście**: kopiowanie plików ręcznie, szablony repo, symbole systemowe, osobne dokumentacje lub po prostu zostawienie starych reguł w nowym projekcie.
- **Ryzykowne założenia**:
  - Użytkownicy faktycznie zmieniają reguły na tyle często, że warto je synchronizować.
  - Różne projekty na tyle dzielą konwencje, że ten sam zestaw reguł/skille ma sens.
  - Osoby w projektach są gotowe przyjąć zewnętrzny pakiet zamiast lokalnych plików.
  - Koszt instalacji i nauki rejestru jest niższy niż koszt ręcznego kopiowania.
- **Już obecne dowody**:
  - W repo BET istnieje `AGENTS.md`, a w profilu użytkownika `CLAUDE.md` — osobne źródła.
  - Brak jednego miejsca wersjonującego reguły AI wykorzystywane w wielu projektach.
  - Dowody są jednak słabe: to obserwacja struktury, a nie raportowanego bólu przez użytkowników.

## Krytyka

- Możemy mylić obecność dwóch plików reguł z realnym problemem — w jednym projekcie kursowym ręczne kopiowanie może być rzadkie.
- Sygnał zakłada, że użytkownik prowadzi wiele repo z tymi samymi narzędziami AI; jeśli projekty używają różnych edytorów (Cursor vs Claude vs Copilot), wspólny rejestr może być mniej wartościowy.
- Obecne obejście (szablon repo, git submodule, skrypt kopiujący) może być wystarczająco dobre przy małej skali.
- Największa wartość pojawia się dopiero przy liczbie projektów >2–3 i częstych zmianach reguł — to trzeba zweryfikować.

## Przewodnik po wywiadach

Cel: 20–30 minut z osobą, która tworzy lub konsumuje reguły/skille AI w projektach.

1. **Rozgrzewka kontekstowa**
   - W jakich projektach używasz reguł AI (`AGENTS.md`, `.cursorrules`, `CLAUDE.md`, skille)?
   - Jak często wchodzisz do nowego projektu i musisz tam ustawić reguły?

2. **Ostatnia historia**
   - Opowiedz mi ostatnim razem, gdy kopiowałeś reguły AI z jednego repo do drugiego. Co dokładnie zrobiłeś?
   - Czy coś poszło nie tak albo zajęło dłużej niż powinno?

3. **Obecne obejście**
   - Jak dzisiaj synchronizujesz reguły między projektami?
   - Czy używasz szablonów repo, symlinków, skryptów, czy kopiujesz ręcznie?
   - Jak często aktualizujesz reguły w istniejących projektach?

4. **Koszt bólu**
   - Ile czasu zajmuje Ci dodanie lub zmiana reguły we wszystkich projektach?
   - Czy kiedykolwiek zdarzyło Ci się, że jeden projekt miał starą wersję reguły i agent zachował się inaczej?
   - Co to kosztuje? (czas, błędy, konsystencja odpowiedzi agenta)

5. **Istniejące alternatywy**
   - Czy próbowałeś już innego sposobu na współdzielenie reguł? Co zadziałało, a co nie?
   - Czy widzisz wartość we wspólnym rejestrze, czy wolisz mieć pełną kontrolę lokalnie?

6. **Sygnał decyzyjny**
   - Co musiałoby się zmienić, żebyś był skłonny używać wspólnego źródła reguł?
   - Co by Cię zniechęciło? (zależność od kolejnego narzędzia, obawa przed utratą kontroli, trudność instalacji)

7. **Prośba o zakończenie**
   - Czy mogę wrócić z krótkim prototypem, żebyś przeszedł przez niego na przykładowych regułach?

### Pytania uzupełniające

- Kto w Twoim zespole decyduje o zmianach reguł AI?
- Czy reguły są projektowe (specyficzne dla jednego repo) czy zespołowe (wspólne)?
- Czy używasz tylko jednego narzędzia AI, czy kilku?

## Ankieta

Cel: szerszy sygnał o częstotliwości i koszcie tarcia.

1. Ile projektów prowadzisz / utrzymujesz, w których używasz reguł AI (`AGENTS.md`, `.cursorrules`, `CLAUDE.md`, skille)?
   - 1
   - 2
   - 3–5
   - 6+

2. Jak często dodajesz lub zmieniasz reguły AI w swoich projektach?
   - Kilka razy dziennie
   - Kilka razy w tygodniu
   - Raz w tygodniu
   - Rzadziej niż raz w tygodniu

3. Ile czasu średnio zajmuje Ci skopiowanie / zsynchronizowanie reguły między projektami?
   - < 5 minut
   - 5–15 minut
   - 15–60 minut
   - > 1 godziny / nie robię tego

4. Jak obecnie synchronizujesz reguły AI między projektami?
   - Ręczne kopiowanie plików
   - Szablon repo / duplikacja
   - Symlinki / skrypty
   - Wspólny pakiet / rejestr
   - Nie synchronizuję

5. Opisz ostatnią sytuację, w której ręczne zarządzanie regułami sprawiło problem (np. stara wersja, pomyłka, dodatkowa praca).
   - [pytanie otwarte]

6. Czy miałeś kiedykolwiek sytuację, w której agent AI zachował się inaczej niż oczekiwałeś, bo reguły były nieaktualne lub różniły się między projektami?
   - Tak, często
   - Tak, kilka razy
   - Nie pamiętam
   - Nie

7. Co byłoby dla Ciebie najważniejsze we wspólnym rejestrze reguł AI?
   - Łatwość instalacji w nowym projekcie
   - Wersjonowanie i historia zmian
   - Możliwość wyboru, które reguły zaimportować
   - Niezależność od konkretnego narzędzia AI (Cursor, Claude, Copilot)
   - Jasna dokumentacja

8. Co by Cię zniechęciło do korzystania z wspólnego rejestru?
   - Dodatkowa zależność
   - Obawa przed utratą kontroli nad lokalnymi regułami
   - Trudność dostosowania do specyfiki projektu
   - Brak widocznej wartości
   - Inne: __________

## Kryteria decyzyjne

- **Kontynuuj**, jeśli:
  - Co najmniej 3 z 5 przeprowadzonych wywiadów opisuje konkretną, niedawną sytuację ręcznego kopiowania reguł bez podpowiedzi.
  - Co najmniej 40% ankietowanych osób z 3+ projektami zgłasza, że synchronizacja zajmuje >15 minut lub powtarza się co tydzień.
  - Co najmniej dwie osoby wskazują realny koszt błędu wynikający z nieaktualnych reguł.

- **Zwęż zakres**, jeśli:
  - Tarcie dotyczy tylko jednego typu artefaktu (np. tylko `CLAUDE.md`) lub jednego narzędzia AI.
  - Użytkownicy chcą synchronizacji, ale tylko w obrębie jednego szablonu repo — wtedy pierwsza wersja to lepszy szablon, nie rejestr.

- **Nie buduj jeszcze**, jeśli:
  - Większość respondentów ma 1–2 projekty i rzadko zmienia reguły.
  - Odpowiedzi na pytanie otwarte są ogólne („przydałoby się”) bez konkretnych przykładów.
  - Koszt obecnego obejścia jest mniejszy niż 5 minut na miesiąc.

- **Najpierw wypróbuj istniejące narzędzie/proces**, jeśli:
  - Szablon repo, git submodule lub skrypt kopiujący wystarcza respondentom.
  - Problemem jest głównie brak nawyku aktualizowania reguł, a nie brak mechanizmu dystrybucji.
