#!/usr/bin/env node
/**
 * Seed 20 student accounts for local E2E / pagination testing.
 *
 * Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from process.env
 * (set them via `.dev.vars` or export before running).
 *
 * Usage:
 *   npx tsx scripts/seed-students.ts
 *
 * The trigger `handle_new_user` automatically inserts `role='student'`
 * into `public.user_roles` for each created auth user.
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.");
  console.error("If using .dev.vars, run with: npx dotenv-cli -e .dev.vars tsx scripts/seed-students.ts");
  process.exit(1);
}

const supabaseAdmin = createClient(url, serviceRoleKey);

const STUDENT_COUNT = 20;
const PASSWORD = "student-pass";

async function seedStudents() {
  console.log(`Seeding ${STUDENT_COUNT} student accounts...`);

  for (let i = 1; i <= STUDENT_COUNT; i++) {
    const suffix = String(i).padStart(3, "0");
    const email = `student_${suffix}@bet.local`;

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    });

    if (error) {
      if (error.message?.includes("already been registered")) {
        console.log(`  ${email} already exists, skipping.`);
        continue;
      }
      console.error(`  Failed to create ${email}:`, error.message);
      continue;
    }

    console.log(`  Created ${email} (${data.user?.id ?? "no id"})`);
  }

  console.log("Done.");
}

seedStudents().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
