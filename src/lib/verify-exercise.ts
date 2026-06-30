import { z } from "zod";
import { parseMatchingKey } from "@/lib/exercise-schemas";

export interface ExerciseKey {
  key_text: string;
  key_metadata?: unknown;
}

const ReferenceOnlySchema = z.object({ is_reference_only: z.boolean() }).partial();

export function isReferenceOnly(metadata: unknown): boolean {
  const parsed = ReferenceOnlySchema.safeParse(metadata);
  return parsed.success && parsed.data.is_reference_only === true;
}

export function normalizeAnswer(answer: string): string {
  return answer.trim().toLowerCase();
}

export function compareMatchingMaps(studentMap: Record<string, string>, correctMap: Record<string, string>): boolean {
  const studentLeft = Object.keys(studentMap);
  const correctLeft = Object.keys(correctMap);
  if (studentLeft.length !== correctLeft.length) {
    return false;
  }
  return studentLeft.every((left) => correctMap[left] === studentMap[left]);
}

export function verifyClosedAnswer(answer: string, keys: ExerciseKey[]): boolean {
  const normalizedAnswer = normalizeAnswer(answer);
  return keys.some((key) => {
    if (isReferenceOnly(key.key_metadata)) {
      return false;
    }
    return normalizeAnswer(key.key_text) === normalizedAnswer;
  });
}

export function verifyMatchingAnswer(answer: string, keys: ExerciseKey[]): boolean {
  let studentMap: Record<string, string>;
  try {
    studentMap = parseMatchingKey(answer);
  } catch {
    return false;
  }

  const keyText = keys.find((key) => !isReferenceOnly(key.key_metadata))?.key_text;
  if (!keyText) {
    return false;
  }

  let correctMap: Record<string, string>;
  try {
    correctMap = parseMatchingKey(keyText);
  } catch {
    return false;
  }

  return compareMatchingMaps(studentMap, correctMap);
}

const CLOSED_EXERCISE_TYPES = ["multiple_choice", "fill_in_blank", "true_false", "sentence_transformation"];

export function verifyExercise(type: string, answer: string, keys: ExerciseKey[]): boolean {
  if (type === "matching") {
    return verifyMatchingAnswer(answer, keys);
  }

  if (type === "open_ended") {
    return false;
  }

  if (CLOSED_EXERCISE_TYPES.includes(type)) {
    return verifyClosedAnswer(answer, keys);
  }

  return false;
}
