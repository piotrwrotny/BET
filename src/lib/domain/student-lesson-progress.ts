import {
  ClosedExercisesNotSolvedError,
  ExerciseNotPartOfLessonError,
  LessonAlreadyCompletedError,
  LessonNotAccessibleError,
  ReadingNotConfirmedError,
} from "@/lib/errors/student-lesson-progress";

export interface LessonCompletionResult {
  user_id: string;
  lesson_id: string;
  completed_at: Date;
}

export class StudentLessonProgress {
  constructor(
    private readonly lessonId: string,
    private readonly userId: string,
    private readonly closedExerciseIds: string[],
    private readonly solvedExerciseIds: Set<string>,
    private readonly readingConfirmed: boolean,
    private readonly isAlreadyCompleted: boolean,
    private readonly isAccessible: boolean,
  ) {}

  confirmReading(): StudentLessonProgress {
    this.guardAccessAndNotCompleted();
    return new StudentLessonProgress(
      this.lessonId,
      this.userId,
      this.closedExerciseIds,
      this.solvedExerciseIds,
      true,
      this.isAlreadyCompleted,
      this.isAccessible,
    );
  }

  recordClosedExerciseSolved(exerciseId: string): StudentLessonProgress {
    this.guardAccessAndNotCompleted();
    if (!this.closedExerciseIds.includes(exerciseId)) {
      throw new ExerciseNotPartOfLessonError(this.lessonId, exerciseId);
    }
    const next = new Set(this.solvedExerciseIds);
    next.add(exerciseId);
    return new StudentLessonProgress(
      this.lessonId,
      this.userId,
      this.closedExerciseIds,
      next,
      this.readingConfirmed,
      this.isAlreadyCompleted,
      this.isAccessible,
    );
  }

  complete(): LessonCompletionResult {
    this.guardAccessAndNotCompleted();

    if (!this.readingConfirmed) {
      throw new ReadingNotConfirmedError(this.lessonId);
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

  isReadingConfirmed(): boolean {
    return this.readingConfirmed;
  }

  areClosedExercisesSolved(): boolean {
    return this.closedExerciseIds.every((id) => this.solvedExerciseIds.has(id));
  }

  private guardAccessAndNotCompleted(): void {
    if (!this.isAccessible) {
      throw new LessonNotAccessibleError(this.lessonId);
    }
    if (this.isAlreadyCompleted) {
      throw new LessonAlreadyCompletedError(this.lessonId);
    }
  }
}
