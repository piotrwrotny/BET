import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";

const UpdateBookSchema = z.object({
  title: z.string().min(1, "Tytuł jest wymagany"),
  cover_url: z
    .string()
    .url("Nieprawidłowy URL")
    .optional()
    .or(z.literal("")),
  description: z.string().optional(),
});

export const POST: APIRoute = async ({ params, request, cookies, locals }) => {
  if (locals.role !== "admin") {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }

  const supabase = createClient(request.headers, cookies);
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503 });
  }

  const { id } = params;
  const formData = await request.formData();
  const raw = {
    title: formData.get("title"),
    cover_url: formData.get("cover_url"),
    description: formData.get("description"),
  };

  const parsed = UpdateBookSchema.safeParse(raw);
  if (!parsed.success) {
    const error = encodeURIComponent(parsed.error.issues[0]?.message ?? "Błąd walidacji");
    return Response.redirect(new URL(`/admin/books/${id}/edit?error=${error}`, request.url), 302);
  }

  const { title, cover_url, description } = parsed.data;
  const { error } = await supabase
    .from("books")
    .update({
      title,
      cover_url: cover_url || null,
      description: description || null,
    })
    .eq("id", id!);

  if (error) {
    const msg = encodeURIComponent(error.message);
    return Response.redirect(new URL(`/admin/books/${id}/edit?error=${msg}`, request.url), 302);
  }

  return Response.redirect(new URL("/admin/books", request.url), 302);
};

export const DELETE: APIRoute = async ({ params, request, cookies, locals }) => {
  if (locals.role !== "admin") {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }

  const supabase = createClient(request.headers, cookies);
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503 });
  }

  const { id } = params;
  const { error } = await supabase.from("books").delete().eq("id", id!);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
