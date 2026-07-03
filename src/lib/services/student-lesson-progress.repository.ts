import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import {
  TABLE_EXERCISES,
  TABLE_EXERCISE_SUBMISSIONS,
  TABLE_LESSONS,
  TABLE_LESSON_PROGRESS,
  TABLE_LESSON_READING_CONFIRMATIONS,
} from "@/lib/db/schema";
import { StudentLessonProgress, type LessonCompletionResult } from "@/lib/domain/student-lesson-progress";
import { LessonNotAccessibleError } from "@/lib/errors/student-lesson-progress";

type Supabase = SupabaseClient<Database>;

const CLOSED_TYPES = new Set(["multiple_choice", "fill_in_blank", "true_false", "sentence_transformation", "matching"]);

export async function loadStudentLessonProgress(
  supabase: Supabase,
  userId: string,
  lessonId: string,
): Promise<StudentLessonProgress> {
  const { data: lesson, error: lessonError } = await supabase
    .from(TABLE_LESSONS)
    .select("id")
    .eq("id", lessonId)
    .maybeSingle();

  if (lessonError || !lesson) {
    throw new LessonNotAccessibleError(lessonId);
  }

  const { data: exercises, error: exercisesError } = await supabase
    .from(TABLE_EXERCISES)
    .select("id, type")
    .eq("lesson_id", lessonId);

  if (exercisesError) {
    throw new LessonNotAccessibleError(lessonId);
  }

  const closedExerciseIds = exercises.filter((e) => CLOSED_TYPES.has(e.type)).map((e) => e.id);

  let solvedExerciseIds = new Set<string>();
  if (closedExerciseIds.length > 0) {
    const { data: submissions, error: submissionsError } = await supabase
      .from(TABLE_EXERCISE_SUBMISSIONS)
      .select("exercise_id")
      .eq("user_id", userId)
      .in("exercise_id", closedExerciseIds);

    if (submissionsError) {
      throw new LessonNotAccessibleError(lessonId);
    }

    solvedExerciseIds = new Set(submissions.map((s) => s.exercise_id));
  }

  const [{ data: readingRow }, { data: progressRow }] = await Promise.all([
    supabase
      .from(TABLE_LESSON_READING_CONFIRMATIONS)
      .select("lesson_id")
      .eq("user_id", userId)
      .eq("lesson_id", lessonId)
      .maybeSingle(),
    supabase
      .from(TABLE_LESSON_PROGRESS)
      .select("lesson_id")
      .eq("user_id", userId)
      .eq("lesson_id", lessonId)
      .maybeSingle(),
  ]);

  return new StudentLessonProgress(
    lessonId,
    userId,
    closedExerciseIds,
    solvedExerciseIds,
    readingRow !== null,
    progressRow !== null,
    true,
  );
}

export async function saveReadingConfirmation(supabase: Supabase, userId: string, lessonId: string): Promise<void> {
  const { error } = await supabase.from(TABLE_LESSON_READING_CONFIRMATIONS).insert({
    user_id: userId,
    lesson_id: lessonId,
  });

  if (error && error.code !== "23505") {
    throw error;
  }
}

export async function saveLessonCompletion(supabase: Supabase, result: LessonCompletionResult): Promise<void> {
  const { error } = await supabase.from(TABLE_LESSON_PROGRESS).insert({
    user_id: result.user_id,
    lesson_id: result.lesson_id,
    completed_at: result.completed_at.toISOString(),
  });

  if (error && error.code !== "23505") {
    throw error;
  }
}
