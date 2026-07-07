import { z } from "zod";

export const REVIEW_INSTRUCTIONS = `Jesteś precyzyjnym, konstruktywnym recenzentem kodu oceniającym pull request.
Oceń podany diff w sześciu kryteriach w skali 1-10 (1 = poważne braki, 10 = wzorowo):

1. implementationCorrectness — czy kod robi to, co deklaruje? 1: logika błędna lub psuje istniejące zachowania; 10: poprawny na ścieżce głównej, przypadkach brzegowych i obsłudze błędów.
2. idiomaticity — zgodność z konwencjami języka i projektu. 1: kod nieczytelny lub łamie konwencje; 10: idiomatyczny i zgodny z lokalnymi standardami.
3. complexity — prostota rozwiązania względem problemu. 1: niepotrzebnie skomplikowane; 10: proste i adekwatne.
4. testRiskCoverage — pokrycie testami proporcjonalne do ryzyka zmienianych ścieżek. 1: brak testów tam, gdzie potrzebne; 10: istotne ścieżki i przypadki brzegowe pokryte.
5. documentation — czy zmiana jest wystarczająco udokumentowana (komentarze, README, changelog, docstrings)? 1: brak dokumentacji tam, gdzie potrzebna; 10: zmiana jest czytelnie opisana.
6. securitySafety — brak podatności i wycieków sekretów. 1: widoczne luki bezpieczeństwa lub wycieki; 10: bezpieczne zarządzanie danymi i sekretami.

Następnie wydaj wiążący werdykt (pass/fail) dla całej zmiany i dołącz krótkie podsumowanie (2-3 zdania) w Markdown.`;

export const JSON_RULES = `Zwróć WYŁĄCZNIE obiekt JSON z dokładnie takimi angielskimi kluczami i wartościami liczbowymi:

{
  "implementationCorrectness": 4,
  "idiomaticity": 4,
  "complexity": 9,
  "testRiskCoverage": 3,
  "documentation": 5,
  "securitySafety": 5,
  "verdict": "fail",
  "summary": "Markdown summary here"
}

Nie używaj polskich nazw kluczy. Nie dodawaj komentarzy poza JSON-em.`;

export const SYSTEM_PROMPT = `${REVIEW_INSTRUCTIONS}\n\n${JSON_RULES}`;

export const REVIEW_SCHEMA = z.object({
  implementationCorrectness: z.number().describe("Poprawność implementacji (skala 1-10)"),
  idiomaticity: z.number().describe("Idiomatyczność (skala 1-10)"),
  complexity: z.number().describe("Złożoność (skala 1-10)"),
  testRiskCoverage: z.number().describe("Pokrycie testami względem ryzyka (skala 1-10)"),
  documentation: z.number().describe("Dokumentacja (skala 1-10)"),
  securitySafety: z.number().describe("Bezpieczeństwo (skala 1-10)"),
  verdict: z.enum(["pass", "fail"]).describe("Wiążący werdykt dla całej zmiany"),
  summary: z.string().describe("Podsumowanie w Markdown, gotowe jako komentarz do PR-a"),
});

export type Review = z.infer<typeof REVIEW_SCHEMA>;

export function buildReviewPrompt(diff: string, prTitle?: string, prBody?: string): string {
  let prompt = "Zrecenzuj ten diff";
  if (prTitle) {
    prompt += ` dla PR-a: "${prTitle}"`;
  }
  prompt += ".\n\n";
  if (prBody) {
    prompt += `Opis PR-a:\n${prBody}\n\n`;
  }
  prompt += `Diff:\n\n${diff}`;
  return prompt;
}
