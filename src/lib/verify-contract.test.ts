import { describe, expect, it } from "vitest";
import { verifyExercise } from "@/lib/verify-exercise";

describe("verifyExercise contract round-trip", () => {
  it("accepts multiple_choice answer and keys as produced by the admin API", () => {
    const keys = [{ key_text: "Paris", key_metadata: null }];
    expect(verifyExercise("multiple_choice", "Paris", keys)).toBe(true);
    expect(verifyExercise("multiple_choice", "London", keys)).toBe(false);
  });

  it("accepts fill_in_blank answer and keys as produced by the admin API", () => {
    const keys = [{ key_text: "quick brown fox", key_metadata: null }];
    expect(verifyExercise("fill_in_blank", "Quick Brown Fox", keys)).toBe(true);
    expect(verifyExercise("fill_in_blank", "slow red fox", keys)).toBe(false);
  });

  it("accepts true_false answer and keys as produced by the admin API", () => {
    const keys = [{ key_text: "true", key_metadata: null }];
    expect(verifyExercise("true_false", "True", keys)).toBe(true);
    expect(verifyExercise("true_false", "False", keys)).toBe(false);
  });

  it("accepts sentence_transformation answer with variant keys as produced by the admin API", () => {
    const keys = [
      { key_text: "I have never been to Paris", key_metadata: null },
      { key_text: "I have never been to Paris before", key_metadata: { is_reference_only: true } },
    ];
    expect(verifyExercise("sentence_transformation", "I have never been to Paris", keys)).toBe(true);
    expect(verifyExercise("sentence_transformation", "I have never been to Paris before", keys)).toBe(false);
  });

  it("accepts matching answer and keys as produced by the admin API", () => {
    const keys = [
      { key_text: '{"cat":"kot","dog":"pies"}', key_metadata: null },
      { key_text: '{"cat":"kitty","dog":"doggy"}', key_metadata: { is_reference_only: true } },
    ];
    expect(verifyExercise("matching", '{"cat":"kot","dog":"pies"}', keys)).toBe(true);
    expect(verifyExercise("matching", '{"cat":"kitty","dog":"doggy"}', keys)).toBe(false);
  });

  it("rejects every open_ended answer because manual review is required", () => {
    const keys = [{ key_text: "any acceptable answer", key_metadata: null }];
    expect(verifyExercise("open_ended", "any acceptable answer", keys)).toBe(false);
    expect(verifyExercise("open_ended", "", keys)).toBe(false);
  });
});
