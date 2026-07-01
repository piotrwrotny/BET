import { defineMiddleware } from "astro:middleware";
import { TABLE_USER_ROLES } from "@/lib/db/schema";
import { createClient } from "@/lib/supabase";

const PROTECTED_ROUTES = ["/dashboard", "/lessons", "/admin", "/student"];

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(context.request.headers, context.cookies);

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;

    if (user) {
      const { data: roleRow } = await supabase
        .from(TABLE_USER_ROLES)
        .select("role")
        .eq("user_id", user.id)
        .single()
        .overrideTypes<{ role: "admin" | "student" } | null, { merge: false }>();
      context.locals.role = roleRow?.role ?? null;
    } else {
      context.locals.role = null;
    }
  } else {
    context.locals.user = null;
    context.locals.role = null;
  }

  if (PROTECTED_ROUTES.some((route) => context.url.pathname.startsWith(route))) {
    if (!context.locals.user) {
      return context.redirect("/auth/signin");
    }
  }

  if (context.url.pathname.startsWith("/admin") && context.locals.role !== "admin") {
    return context.redirect("/dashboard");
  }

  return next();
});
