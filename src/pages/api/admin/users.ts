import type { APIRoute } from "astro";
import { getStudentsWithAccess } from "@/lib/services/user-admin";

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  if (locals.role !== "admin") {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }

  try {
    const users = await getStudentsWithAccess();

    return new Response(JSON.stringify({ users }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("Failed to load admin users:", error);
    return new Response(JSON.stringify({ error: "Failed to load users" }), { status: 500 });
  }
};
