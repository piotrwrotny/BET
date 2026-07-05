export class StudentLessonProgressError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StudentLessonProgressError";
  }
}

export class LessonNotAccessibleError extends StudentLessonProgressError {
  constructor(public readonly lessonId: string) {
    super(`Lesson ${lessonId} is not accessible`);
    this.name = "LessonNotAccessibleError";
  }
}

export class LessonAlreadyCompletedError extends StudentLessonProgressError {
  constructor(public readonly lessonId: string) {
    super(`Lesson ${lessonId} is already completed`);
    this.name = "LessonAlreadyCompletedError";
  }
}

export class ReadingNotConfirmedError extends StudentLessonProgressError {
  constructor(public readonly lessonId: string) {
    super(`Reading has not been confirmed for lesson ${lessonId}`);
    this.name = "ReadingNotConfirmedError";
  }
}

export class ClosedExercisesNotSolvedError extends StudentLessonProgressError {
  readonly unsolvedExerciseIds: string[];

  constructor(unsolvedExerciseIds: string[]) {
    super(`Closed exercises not solved: ${unsolvedExerciseIds.join(", ")}`);
    this.name = "ClosedExercisesNotSolvedError";
    this.unsolvedExerciseIds = unsolvedExerciseIds;
  }
}

export class ExerciseNotPartOfLessonError extends StudentLessonProgressError {
  constructor(
    public readonly lessonId: string,
    public readonly exerciseId: string,
  ) {
    super(`Exercise ${exerciseId} is not part of lesson ${lessonId}`);
    this.name = "ExerciseNotPartOfLessonError";
  }
}
