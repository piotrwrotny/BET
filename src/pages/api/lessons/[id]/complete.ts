import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { uuidSchema } from "@/lib/utils";
export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
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

  // Idempotent: PK (user_id, lesson_id) prevents duplicates; ignoreDuplicates skips conflict error.
  // RLS INSERT policy: user_id = auth.uid() AND has_lesson_access(lesson_id).
  const { error } = await supabase
    .from("lesson_progress")
    .upsert(
      { user_id: user.id, lesson_id: validLessonId },
      { onConflict: "user_id,lesson_id", ignoreDuplicates: true },
    );

  if (error) {
    // RLS violation: student doesn't have access to this lesson
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  return Response.json({ success: true }, {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
