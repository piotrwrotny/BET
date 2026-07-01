import {
  ClosedExercisesNotSolvedError,
  LessonAlreadyCompletedError,
  LessonCompletionError,
} from "@/lib/errors/lesson-completion";

export interface LessonCompletionResult {
  user_id: string;
  lesson_id: string;
  completed_at: Date;
}

export class LessonCompletion {
  constructor(
    private readonly lessonId: string,
    private readonly userId: string,
    private readonly closedExerciseIds: string[],
    private readonly solvedExerciseIds: Set<string>,
    private readonly isAlreadyCompleted: boolean,
  ) {}

  markComplete(): LessonCompletionResult {
    if (this.isAlreadyCompleted) {
      throw new LessonAlreadyCompletedError(this.lessonId);
    }

    const unsolved = this.closedExerciseIds.filter((id) => !this.solvedExerciseIds.has(id));
    if (unsolved.length > 0) {
      throw new ClosedExercisesNotSolvedError(unsolved);
    }

    return {
      user_id: this.userId,
      lesson_id: this.lessonId,
      completed_at: new Date(),
    };
  }
}

export function isLessonCompletionError(error: unknown): error is LessonCompletionError {
  return error instanceof LessonCompletionError;
}
