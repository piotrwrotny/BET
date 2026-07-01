import { LessonCompletion } from "./lesson-completion";
import { LessonNotAccessibleError } from "@/lib/errors/lesson-completion";
import type { Database } from "@/lib/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

type Supabase = SupabaseClient<Database>;

const CLOSED_EXERCISE_LOOKUP: Record<string, boolean | undefined> = {
  multiple_choice: true,
  fill_in_blank: true,
  true_false: true,
  sentence_transformation: true,
  matching: true,
};

export async function loadLessonCompletion(
  supabase: Supabase,
  userId: string,
  lessonId: string,
): Promise<LessonCompletion> {
  const { data: lesson, error: lessonError } = await supabase
    .from("lessons")
    .select("id")
    .eq("id", lessonId)
    .maybeSingle();

  if (lessonError || !lesson) {
    throw new LessonNotAccessibleError(lessonId);
  }

  const { data: exercises, error: exercisesError } = await supabase
    .from("exercises")
    .select("id, type")
    .eq("lesson_id", lessonId);

  if (exercisesError) {
    throw new LessonNotAccessibleError(lessonId);
  }

  const closedExerciseIds = exercises.filter((ex) => CLOSED_EXERCISE_LOOKUP[ex.type] === true).map((ex) => ex.id);

  let solvedExerciseIds = new Set<string>();
  if (closedExerciseIds.length > 0) {
    const { data: submissions, error: submissionsError } = await supabase
      .from("exercise_submissions")
      .select("exercise_id")
      .eq("user_id", userId)
      .in("exercise_id", closedExerciseIds);

    if (submissionsError) {
      throw new LessonNotAccessibleError(lessonId);
    }

    solvedExerciseIds = new Set(submissions.map((s) => s.exercise_id));
  }

  const { data: progress, error: progressError } = await supabase
    .from("lesson_progress")
    .select("lesson_id")
    .eq("user_id", userId)
    .eq("lesson_id", lessonId)
    .maybeSingle();

  if (progressError) {
    throw new LessonNotAccessibleError(lessonId);
  }

  return new LessonCompletion(lessonId, userId, closedExerciseIds, solvedExerciseIds, progress !== null);
}

export async function saveLessonCompletion(
  supabase: Supabase,
  result: { user_id: string; lesson_id: string; completed_at: Date },
): Promise<void> {
  const { error } = await supabase.from("lesson_progress").insert({
    user_id: result.user_id,
    lesson_id: result.lesson_id,
    completed_at: result.completed_at.toISOString(),
  });

  if (error && error.code !== "23505") {
    throw error;
  }
}
