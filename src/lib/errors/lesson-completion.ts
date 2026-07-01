export class LessonCompletionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LessonCompletionError";
  }
}

export class LessonNotAccessibleError extends LessonCompletionError {
  constructor(lessonId: string) {
    super(`Lesson ${lessonId} is not accessible`);
    this.name = "LessonNotAccessibleError";
  }
}

export class LessonAlreadyCompletedError extends LessonCompletionError {
  constructor(lessonId: string) {
    super(`Lesson ${lessonId} is already completed`);
    this.name = "LessonAlreadyCompletedError";
  }
}

export class ClosedExercisesNotSolvedError extends LessonCompletionError {
  readonly unsolvedExerciseIds: string[];

  constructor(unsolvedExerciseIds: string[]) {
    super(`Closed exercises not solved: ${unsolvedExerciseIds.join(", ")}`);
    this.name = "ClosedExercisesNotSolvedError";
    this.unsolvedExerciseIds = unsolvedExerciseIds;
  }
}
