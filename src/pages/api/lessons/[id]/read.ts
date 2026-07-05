import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase.server";
import { uuidSchema } from "@/lib/utils";
import type { Database } from "@/lib/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSameOrigin } from "@/lib/guards";
import { loadStudentLessonProgress, saveReadingConfirmation } from "@/lib/services/student-lesson-progress.repository";
import { LessonAlreadyCompletedError, LessonNotAccessibleError } from "@/lib/errors/student-lesson-progress";

export const POST: APIRoute = async (context) => {
  const originCheck = requireSameOrigin(context.request);
  if (originCheck) return originCheck;

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
  const parsed = uuidSchema.safeParse(lessonId);
  if (!parsed.success) {
    return Response.json({ error: "Invalid lesson ID" }, { status: 400 });
  }
  const validLessonId = parsed.data;

  try {
    const aggregate = await loadStudentLessonProgress(supabase, user.id, validLessonId);
    aggregate.confirmReading();
    await saveReadingConfirmation(supabase, user.id, validLessonId);
  } catch (error) {
    if (error instanceof LessonAlreadyCompletedError) {
      return Response.json({ success: true }, { status: 200 });
    }
    if (error instanceof LessonNotAccessibleError) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    return Response.json({ error: "Failed to record reading confirmation" }, { status: 500 });
  }

  return Response.json({ success: true }, { status: 200 });
};
