import { describe, expect, it } from "vitest";
import { StudentLessonProgress } from "./student-lesson-progress";
import {
  ClosedExercisesNotSolvedError,
  ExerciseNotPartOfLessonError,
  LessonAlreadyCompletedError,
  LessonNotAccessibleError,
  ReadingNotConfirmedError,
} from "@/lib/errors/student-lesson-progress";

describe("StudentLessonProgress", () => {
  const lessonId = "lesson-1";
  const userId = "user-1";

  function aggregate(
    options: {
      closedExerciseIds?: string[];
      solvedExerciseIds?: string[];
      readingConfirmed?: boolean;
      isAlreadyCompleted?: boolean;
      isAccessible?: boolean;
    } = {},
  ) {
    return new StudentLessonProgress(
      lessonId,
      userId,
      options.closedExerciseIds ?? [],
      new Set(options.solvedExerciseIds ?? []),
      options.readingConfirmed ?? false,
      options.isAlreadyCompleted ?? false,
      options.isAccessible ?? true,
    );
  }

  it("completes a read-only lesson when reading is confirmed", () => {
    const result = aggregate({ readingConfirmed: true }).complete();
    expect(result.lesson_id).toBe(lessonId);
    expect(result.user_id).toBe(userId);
    expect(result.completed_at).toBeInstanceOf(Date);
  });

  it("completes when reading is confirmed and all closed exercises are solved", () => {
    const result = aggregate({
      closedExerciseIds: ["ex-1", "ex-2"],
      solvedExerciseIds: ["ex-1", "ex-2"],
      readingConfirmed: true,
    }).complete();
    expect(result.lesson_id).toBe(lessonId);
  });

  it("throws ReadingNotConfirmedError when exercises are solved but reading is not confirmed", () => {
    const progress = aggregate({
      closedExerciseIds: ["ex-1"],
      solvedExerciseIds: ["ex-1"],
      readingConfirmed: false,
    });
    expect(() => progress.complete()).toThrow(ReadingNotConfirmedError);
  });

  it("throws ClosedExercisesNotSolvedError when reading is confirmed but exercises are missing", () => {
    const progress = aggregate({
      closedExerciseIds: ["ex-1", "ex-2"],
      solvedExerciseIds: ["ex-1"],
      readingConfirmed: true,
    });
    expect(() => progress.complete()).toThrow(ClosedExercisesNotSolvedError);
  });

  it("throws ReadingNotConfirmedError before ClosedExercisesNotSolvedError when both conditions fail", () => {
    const progress = aggregate({
      closedExerciseIds: ["ex-1"],
      solvedExerciseIds: [],
      readingConfirmed: false,
    });
    expect(() => progress.complete()).toThrow(ReadingNotConfirmedError);
  });

  it("returns a new instance with reading confirmed via confirmReading", () => {
    const initial = aggregate();
    const confirmed = initial.confirmReading();
    expect(confirmed.isReadingConfirmed()).toBe(true);
    expect(initial.isReadingConfirmed()).toBe(false);
  });

  it("records a closed exercise as solved", () => {
    const progress = aggregate({ closedExerciseIds: ["ex-1"] })
      .confirmReading()
      .recordClosedExerciseSolved("ex-1");
    expect(progress.areClosedExercisesSolved()).toBe(true);
  });

  it("throws ExerciseNotPartOfLessonError when recording an unknown exercise", () => {
    const progress = aggregate({ closedExerciseIds: ["ex-1"] });
    expect(() => progress.recordClosedExerciseSolved("ex-unknown")).toThrow(ExerciseNotPartOfLessonError);
  });

  it("throws LessonAlreadyCompletedError when completing an already completed lesson", () => {
    const progress = aggregate({ readingConfirmed: true, isAlreadyCompleted: true });
    expect(() => progress.complete()).toThrow(LessonAlreadyCompletedError);
  });

  it("throws LessonNotAccessibleError when lesson is not accessible", () => {
    const progress = aggregate({ isAccessible: false });
    expect(() => progress.complete()).toThrow(LessonNotAccessibleError);
    expect(() => progress.confirmReading()).toThrow(LessonNotAccessibleError);
  });

  it("open-ended exercises do not block completion when reading is confirmed", () => {
    const result = aggregate({
      closedExerciseIds: [],
      solvedExerciseIds: [],
      readingConfirmed: true,
    }).complete();
    expect(result.lesson_id).toBe(lessonId);
  });
});
