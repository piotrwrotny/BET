import { describe, expect, it } from "vitest";
import {
  compareMatchingMaps,
  isReferenceOnly,
  normalizeAnswer,
  verifyClosedAnswer,
  verifyExercise,
  verifyMatchingAnswer,
} from "@/lib/verify-exercise";

describe("normalizeAnswer", () => {
  it("trims whitespace and lowercases", () => {
    expect(normalizeAnswer("  Hello World  ")).toBe("hello world");
  });

  it("handles empty string", () => {
    expect(normalizeAnswer("")).toBe("");
  });

  it("preserves internal spacing and punctuation", () => {
    expect(normalizeAnswer("  A, B, C!  ")).toBe("a, b, c!");
  });
});

describe("isReferenceOnly", () => {
  it("returns true for explicit reference-only metadata", () => {
    expect(isReferenceOnly({ is_reference_only: true })).toBe(true);
  });

  it("returns false when flag is missing", () => {
    expect(isReferenceOnly({})).toBe(false);
  });

  it("returns false when flag is false", () => {
    expect(isReferenceOnly({ is_reference_only: false })).toBe(false);
  });

  it("returns false for null and primitive metadata", () => {
    expect(isReferenceOnly(null)).toBe(false);
    expect(isReferenceOnly(undefined)).toBe(false);
    expect(isReferenceOnly("note")).toBe(false);
  });
});

describe("compareMatchingMaps", () => {
  it("returns true for identical maps", () => {
    expect(compareMatchingMaps({ a: "1", b: "2" }, { a: "1", b: "2" })).toBe(true);
  });

  it("returns false when a value differs", () => {
    expect(compareMatchingMaps({ a: "1" }, { a: "2" })).toBe(false);
  });

  it("returns false when key sets differ", () => {
    expect(compareMatchingMaps({ a: "1" }, { a: "1", b: "2" })).toBe(false);
  });

  it("returns true for two empty maps", () => {
    expect(compareMatchingMaps({}, {})).toBe(true);
  });
});

describe("verifyClosedAnswer", () => {
  const keys = [
    { key_text: "Apple", key_metadata: null },
    { key_text: "Banana", key_metadata: { is_reference_only: true } },
    { key_text: "  Cherry  ", key_metadata: undefined },
  ];

  it("matches the first correct key ignoring case and trim", () => {
    expect(verifyClosedAnswer("apple", keys)).toBe(true);
  });

  it("matches a later acceptable key", () => {
    expect(verifyClosedAnswer("  cherry", keys)).toBe(true);
  });

  it("skips reference-only keys", () => {
    expect(verifyClosedAnswer("banana", keys)).toBe(false);
  });

  it("returns false for a wrong answer", () => {
    expect(verifyClosedAnswer("grape", keys)).toBe(false);
  });

  it("returns false for an empty key list", () => {
    expect(verifyClosedAnswer("apple", [])).toBe(false);
  });
});

describe("verifyMatchingAnswer", () => {
  const keys = [
    { key_text: '{"a":"1","b":"2"}', key_metadata: null },
    { key_text: '{"a":"9"}', key_metadata: { is_reference_only: true } },
  ];

  it("returns true when student map matches the canonical key", () => {
    expect(verifyMatchingAnswer('{"a":"1","b":"2"}', keys)).toBe(true);
  });

  it("returns false for a wrong value", () => {
    expect(verifyMatchingAnswer('{"a":"9","b":"2"}', keys)).toBe(false);
  });

  it("returns false when student adds an extra key", () => {
    expect(verifyMatchingAnswer('{"a":"1","b":"2","c":"3"}', keys)).toBe(false);
  });

  it("returns false when student is missing a key", () => {
    expect(verifyMatchingAnswer('{"a":"1"}', keys)).toBe(false);
  });

  it("returns false for malformed JSON", () => {
    expect(verifyMatchingAnswer("not json", keys)).toBe(false);
  });

  it("returns false when all keys are reference-only", () => {
    expect(
      verifyMatchingAnswer('{"a":"1"}', [{ key_text: '{"a":"1"}', key_metadata: { is_reference_only: true } }]),
    ).toBe(false);
  });

  it("returns false when the canonical key is malformed JSON", () => {
    expect(verifyMatchingAnswer('{"a":"1"}', [{ key_text: "not json", key_metadata: null }])).toBe(false);
  });
});

describe("verifyExercise dispatch", () => {
  const closedKeys = [{ key_text: "answer", key_metadata: null }];
  const matchingKeys = [{ key_text: '{"a":"1"}', key_metadata: null }];

  it.each([
    ["multiple_choice", "answer", closedKeys, true],
    ["fill_in_blank", "answer", closedKeys, true],
    ["true_false", "answer", closedKeys, true],
    ["sentence_transformation", "answer", closedKeys, true],
  ] as const)("routes %s to closed-answer verification", (type, answer, keys, expected) => {
    expect(verifyExercise(type, answer, keys)).toBe(expected);
  });

  it("routes matching to matching verification", () => {
    expect(verifyExercise("matching", '{"a":"1"}', matchingKeys)).toBe(true);
  });

  it("returns false for open-ended exercises", () => {
    expect(verifyExercise("open_ended", "any answer", closedKeys)).toBe(false);
  });

  it("returns false for unknown exercise types", () => {
    expect(verifyExercise("unknown", "answer", closedKeys)).toBe(false);
  });
});
