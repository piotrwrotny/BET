import type { APIRoute } from "astro";
import { getAllUsersWithAccess } from "@/lib/services/user-admin";

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  if (locals.role !== "admin") {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }

  try {
    const users = await getAllUsersWithAccess();

    if (users.length >= 50) {
      console.warn("GET /api/admin/users reached default listUsers page size (50)");
    }

    return new Response(JSON.stringify({ users }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
};
