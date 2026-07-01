import { z } from "zod";

export const SYSTEM_PROMPT = `Jesteś precyzyjnym, konstruktywnym recenzentem kodu oceniającym pull request.
Oceń podany diff w pięciu kryteriach w skali 1-10 (1 = poważne braki, 10 = wzorowo):
poprawność implementacji, idiomatyczność, złożoność, pokrycie testami względem ryzyka, bezpieczeństwo.
Następnie wydaj wiążący werdykt (pass/fail) dla całej zmiany i dołącz krótkie podsumowanie (2-3 zdania)
w Markdown, na podstawie którego autor PR-a będzie mógł działać.

Zwróć WYŁĄCZNIE obiekt JSON z dokładnie takimi angielskimi kluczami i wartościami liczbowymi:

{
  "implementationCorrectness": 4,
  "idiomaticity": 4,
  "complexity": 9,
  "testRiskCoverage": 3,
  "securitySafety": 5,
  "verdict": "fail",
  "summary": "Markdown summary here"
}

Nie używaj polskich nazw kluczy. Nie dodawaj komentarzy poza JSON-em.`;

export const REVIEW_SCHEMA = z.object({
  implementationCorrectness: z
    .number()
    .describe(
      "Poprawność implementacji: czy kod robi to, co deklaruje (skala 1-10). " +
        "1: logika jest błędna lub po cichu psuje istniejące zachowania. " +
        "10: poprawny na ścieżce głównej, w przypadkach brzegowych i w obsłudze błędów.",
    ),
  idiomaticity: z
    .number()
    .describe(
      "Idiomatyczność: zgodność z konwencjami języka i projektu (skala 1-10). " +
        "1: kod jest nieczytelny lub łamie ustalone konwencje. " +
        "10: zgodny z lokalnymi standardami i idiomatyczny.",
    ),
  complexity: z
    .number()
    .describe(
      "Złożoność: prostota rozwiązania względem problemu (skala 1-10). " +
        "1: rozwiązanie jest niepotrzebnie skomplikowane. " +
        "10: proste i adekwatne do problemu.",
    ),
  testRiskCoverage: z
    .number()
    .describe(
      "Pokrycie testami proporcjonalne do ryzyka zmienianych ścieżek (skala 1-10). " +
        "1: brak testów tam, gdzie są potrzebne. " +
        "10: testy pokrywają istotne ścieżki i przypadki brzegowe.",
    ),
  securitySafety: z
    .number()
    .describe(
      "Bezpieczeństwo: brak podatności i wycieków sekretów (skala 1-10). " +
        "1: widoczne luki bezpieczeństwa lub wycieki. " +
        "10: bezpieczne zarządzanie danymi i sekretami.",
    ),
  verdict: z.enum(["pass", "fail"]).describe("Wiążący werdykt dla całej zmiany"),
  summary: z.string().describe("Podsumowanie w Markdown, gotowe jako komentarz do PR-a"),
});

export type Review = z.infer<typeof REVIEW_SCHEMA>;
