import { describe, expect, it } from "vitest";
import {
  ClosedExercisesNotSolvedError,
  LessonAlreadyCompletedError,
  LessonNotAccessibleError,
} from "@/lib/errors/lesson-completion";
import { LessonCompletion } from "./lesson-completion";

const USER_ID = "00000000-0000-0000-0000-000000000002";
const LESSON_ID = "00000000-0000-0000-0000-000000000034";

function aggregate(props: {
  closedExerciseIds?: string[];
  solvedExerciseIds?: string[];
  isAlreadyCompleted?: boolean;
}) {
  return new LessonCompletion(
    LESSON_ID,
    USER_ID,
    props.closedExerciseIds ?? [],
    new Set(props.solvedExerciseIds ?? []),
    props.isAlreadyCompleted ?? false,
  );
}

describe("LessonCompletion", () => {
  it("marks a reading-only lesson complete", () => {
    const result = aggregate({}).markComplete();
    expect(result.user_id).toBe(USER_ID);
    expect(result.lesson_id).toBe(LESSON_ID);
    expect(result.completed_at).toBeInstanceOf(Date);
  });

  it("marks a lesson complete when all closed exercises are solved", () => {
    const result = aggregate({
      closedExerciseIds: ["ex-1", "ex-2"],
      solvedExerciseIds: ["ex-1", "ex-2"],
    }).markComplete();
    expect(result.user_id).toBe(USER_ID);
    expect(result.lesson_id).toBe(LESSON_ID);
  });

  it("ignores open-ended exercises in solved set", () => {
    const result = aggregate({
      closedExerciseIds: ["ex-1"],
      solvedExerciseIds: ["ex-1", "open-1"],
    }).markComplete();
    expect(result.lesson_id).toBe(LESSON_ID);
  });

  it("throws ClosedExercisesNotSolvedError when a closed exercise is missing", () => {
    expect(() =>
      aggregate({
        closedExerciseIds: ["ex-1", "ex-2"],
        solvedExerciseIds: ["ex-1"],
      }).markComplete(),
    ).toThrow(ClosedExercisesNotSolvedError);
  });

  it("reports unsolved exercise ids in the error", () => {
    try {
      aggregate({
        closedExerciseIds: ["ex-1", "ex-2", "ex-3"],
        solvedExerciseIds: ["ex-1"],
      }).markComplete();
      expect.fail("should throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ClosedExercisesNotSolvedError);
      expect((error as ClosedExercisesNotSolvedError).unsolvedExerciseIds).toEqual(["ex-2", "ex-3"]);
    }
  });

  it("throws LessonAlreadyCompletedError when already completed", () => {
    expect(() =>
      aggregate({
        closedExerciseIds: ["ex-1"],
        solvedExerciseIds: ["ex-1"],
        isAlreadyCompleted: true,
      }).markComplete(),
    ).toThrow(LessonAlreadyCompletedError);
  });
});

describe("Lesson completion errors", () => {
  it("LessonNotAccessibleError has the right name", () => {
    const error = new LessonNotAccessibleError(LESSON_ID);
    expect(error.name).toBe("LessonNotAccessibleError");
  });
});
