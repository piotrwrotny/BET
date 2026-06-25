declare namespace App {
  interface Locals {
    user: import("@supabase/supabase-js").User | null;
    role: "admin" | "student" | null;
  }
}
