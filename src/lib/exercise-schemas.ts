import { z } from "zod";

export const ExerciseTypeEnum = z.enum([
  "multiple_choice",
  "fill_in_blank",
  "matching",
  "true_false",
  "sentence_transformation",
  "open_ended",
]);

export type ExerciseType = z.infer<typeof ExerciseTypeEnum>;

export const MultipleChoicePayloadSchema = z.object({
  options: z.array(z.string()),
});

export const FillInBlankPayloadSchema = z.object({}).strict();
export const TrueFalsePayloadSchema = z.object({}).strict();

export const SentenceTransformationPayloadSchema = z.object({
  original: z.string().min(1, "Oryginalne zdanie jest wymagane"),
});

export const OpenEndedPayloadSchema = z.object({}).strict();

export const MatchingPairSchema = z.object({
  left: z.string().min(1, "Lewa strony pary nie może być pusta"),
  right: z.string().min(1, "Prawa strony pary nie może być pusta"),
});

export const MatchingPayloadSchema = z.object({
  pairs: z.array(MatchingPairSchema).min(2, "Wymagane co najmniej 2 pary"),
});

export const ExercisePayloadSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("multiple_choice"),
    payload: MultipleChoicePayloadSchema,
  }),
  z.object({
    type: z.literal("fill_in_blank"),
    payload: FillInBlankPayloadSchema,
  }),
  z.object({
    type: z.literal("true_false"),
    payload: TrueFalsePayloadSchema,
  }),
  z.object({
    type: z.literal("matching"),
    payload: MatchingPayloadSchema,
  }),
  z.object({
    type: z.literal("sentence_transformation"),
    payload: SentenceTransformationPayloadSchema,
  }),
  z.object({
    type: z.literal("open_ended"),
    payload: OpenEndedPayloadSchema,
  }),
]);

export type DiscriminatedExercisePayload = z.infer<typeof ExercisePayloadSchema>;

export function parseMatchingKey(keyText: string): Record<string, string> {
  const parsed: unknown = JSON.parse(keyText);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Klucz matchingu musi być obiektem");
  }
  const result: Record<string, string> = {};
  for (const [left, right] of Object.entries(parsed as Record<string, unknown>)) {
    result[left] = String(right);
  }
  return result;
}
