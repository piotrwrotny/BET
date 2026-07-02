import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase.server";
import { uuidSchema } from "@/lib/utils";
import type { Database } from "@/lib/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ClosedExercisesNotSolvedError,
  LessonAlreadyCompletedError,
  LessonNotAccessibleError,
} from "@/lib/errors/lesson-completion";
import { loadLessonCompletion, saveLessonCompletion } from "@/lib/services/lesson-completion.repository";

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies) as SupabaseClient<Database> | null;
  if (!supabase) {
    return Response.json({ error: "Service unavailable" }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const lessonId = context.params.id;
  const uuidResult = uuidSchema.safeParse(lessonId);
  if (!uuidResult.success) {
    return Response.json({ error: "Invalid lesson ID" }, { status: 400 });
  }

  const validLessonId = uuidResult.data;

  try {
    const completion = await loadLessonCompletion(supabase, user.id, validLessonId);
    const result = completion.markComplete();
    await saveLessonCompletion(supabase, result);
  } catch (error) {
    if (error instanceof LessonAlreadyCompletedError) {
      return Response.json({ success: true }, { status: 200 });
    }
    if (error instanceof ClosedExercisesNotSolvedError) {
      return Response.json({ error: "Nie rozwiązano wszystkich ćwiczeń zamkniętych" }, { status: 409 });
    }
    if (error instanceof LessonNotAccessibleError) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    return Response.json({ error: "Failed to record lesson completion" }, { status: 500 });
  }

  return Response.json(
    { success: true },
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
};
