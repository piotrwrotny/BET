import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const lessonId = context.params.id;
  if (!lessonId) {
    return new Response(JSON.stringify({ error: "Missing lesson ID" }), { status: 400 });
  }

  // Idempotent: PK (user_id, lesson_id) prevents duplicates; ignoreDuplicates skips conflict error.
  // RLS INSERT policy: user_id = auth.uid() AND has_lesson_access(lesson_id).
  const { error } = await supabase
    .from("lesson_progress")
    .upsert({ user_id: user.id, lesson_id: lessonId }, { onConflict: "user_id,lesson_id", ignoreDuplicates: true });

  if (error) {
    // RLS violation: student doesn't have access to this lesson
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
