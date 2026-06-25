-- =============================================================================
-- BET F-01 Phase 2: Seed data for local dev
-- =============================================================================
-- Applied automatically by `supabase db reset` after migrations.
-- Deterministic UUIDs + known credentials so dev can log in immediately.
-- Schema: enables S-01 (first-lesson-end-to-end) AND S-05 (sequential nav +
-- chapter aggregate) testing locally without waiting on S-02 admin UI.
--
-- Credentials (local dev only — never use in production):
--   admin@bet.local  / admin-pass
--   student@bet.local / student-pass
-- =============================================================================

-- =========================================================================
-- Section 1: Users (auth.users + auth.identities + role promotion)
-- =========================================================================
-- Direct insert into auth.users + auth.identities bypasses Supabase Auth
-- API but is the standard local-dev seeding pattern. The trigger
-- handle_new_user (Phase 1) automatically inserts a `student` row into
-- public.user_roles for each new auth.users row; admin role is then
-- promoted by UPDATE.
-- =========================================================================

do $$
declare
  admin_id constant uuid := '00000000-0000-0000-0000-000000000001';
  student_id constant uuid := '00000000-0000-0000-0000-000000000002';
begin
  -- 1.1 Admin user
  insert into auth.users (
    id, instance_id, email, encrypted_password, aud, role,
    raw_app_meta_data, raw_user_meta_data,
    email_confirmed_at, created_at, updated_at,
    confirmation_token, recovery_token,
    email_change, email_change_token_new, email_change_token_current,
    phone_change, phone_change_token,
    reauthentication_token
  ) values (
    admin_id, '00000000-0000-0000-0000-000000000000', 'admin@bet.local',
    crypt('admin-pass', gen_salt('bf')), 'authenticated', 'authenticated',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(), now(),
    '', '',
    '', '', '',
    '', '',
    ''
  );

  insert into auth.identities (
    provider_id, user_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) values (
    admin_id::text, admin_id,
    jsonb_build_object('sub', admin_id::text, 'email', 'admin@bet.local'),
    'email', now(), now(), now()
  );

  -- Trigger handle_new_user inserted role='student'; promote to admin.
  update public.user_roles set role = 'admin' where user_id = admin_id;

  -- 1.2 Student user (role stays 'student' from trigger)
  insert into auth.users (
    id, instance_id, email, encrypted_password, aud, role,
    raw_app_meta_data, raw_user_meta_data,
    email_confirmed_at, created_at, updated_at,
    confirmation_token, recovery_token,
    email_change, email_change_token_new, email_change_token_current,
    phone_change, phone_change_token,
    reauthentication_token
  ) values (
    student_id, '00000000-0000-0000-0000-000000000000', 'student@bet.local',
    crypt('student-pass', gen_salt('bf')), 'authenticated', 'authenticated',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(), now(),
    '', '',
    '', '', '',
    '', '',
    ''
  );

  insert into auth.identities (
    provider_id, user_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) values (
    student_id::text, student_id,
    jsonb_build_object('sub', student_id::text, 'email', 'student@bet.local'),
    'email', now(), now(), now()
  );
end $$;

-- =========================================================================
-- Section 2: Content — 1 book → 2 chapters → 5 lessons
-- =========================================================================

insert into public.books (id, title, description) values
  ('00000000-0000-0000-0000-000000000010',
   'FCE Practice Book 1',
   'Sample preparation course for the Cambridge B2 First (FCE) exam — seeded for local dev.');

insert into public.user_book_access (user_id, book_id) values
  ('00000000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000010');

insert into public.chapters (id, book_id, title, ord) values
  ('00000000-0000-0000-0000-000000000020',
   '00000000-0000-0000-0000-000000000010',
   'Chapter 1: Tenses Review', 0),
  ('00000000-0000-0000-0000-000000000021',
   '00000000-0000-0000-0000-000000000010',
   'Chapter 2: Sentence Transformations', 1);

insert into public.lessons (id, chapter_id, title, content, ord) values
  -- Chapter 1: 3 lessons (one MC, one fill-in-blank, one reading-only).
  ('00000000-0000-0000-0000-000000000030',
   '00000000-0000-0000-0000-000000000020',
   'Past Simple vs Present Perfect',
   '## Past Simple vs Present Perfect

The **Past Simple** is used for completed actions at a specific time in the past:

- *I went to Paris last summer.*

The **Present Perfect** describes actions that started in the past and either continue or have results in the present:

- *I have lived here for five years.*

Use the exercise below to check your understanding.',
   0),
  ('00000000-0000-0000-0000-000000000031',
   '00000000-0000-0000-0000-000000000020',
   'Time Expressions: For / Since',
   '## Time Expressions: For / Since

Use **for** with a duration (a period of time):
- *for five years, for two hours*

Use **since** with a starting point:
- *since 2020, since last Monday*

Practice with the fill-in-the-blank exercise below.',
   1),
  ('00000000-0000-0000-0000-000000000032',
   '00000000-0000-0000-0000-000000000020',
   'Reading: Common Tense Mistakes',
   '## Common Tense Mistakes

Many learners confuse the Past Simple and Present Perfect. Remember:

1. If the time is specified (yesterday, last week, in 2019) — use Past Simple.
2. If the time is unspecified or the action continues — use Present Perfect.
3. *I have seen him yesterday* is **wrong**. *I saw him yesterday* is right.

This lesson is reading-only — click "Przeczytano" to mark it complete.',
   2),

  -- Chapter 2: 2 lessons (true/false, sentence transformation + open-ended).
  ('00000000-0000-0000-0000-000000000033',
   '00000000-0000-0000-0000-000000000021',
   'Spotting Wrong Statements',
   '## Spotting Wrong Statements

Read each statement and decide whether it is true or false. Then try the exercise below.',
   0),
  ('00000000-0000-0000-0000-000000000034',
   '00000000-0000-0000-0000-000000000021',
   'Mixed Practice: Transform & Describe',
   '## Mixed Practice

Two exercises here:

1. **Sentence transformation** — rewrite the sentence keeping the meaning the same.
2. **Open-ended question** — answer freely in English; the reference answer is provided for self-assessment and does NOT block lesson completion (FR-025).',
   1);

-- =========================================================================
-- Section 3: Exercises + exercise_keys (covers 5 of 6 types from FR-018..023)
-- =========================================================================
-- Matching (FR-019) intentionally omitted from seed — added in S-06 when the
-- admin UI for that type lands. Seed covers MC (FR-022), fill-in-blank
-- (FR-018), true/false (FR-023), sentence transformation (FR-020), and
-- open-ended (FR-021).
-- =========================================================================

insert into public.exercises (id, lesson_id, type, prompt, payload, ord) values
  -- 3.1 Multiple-choice (FR-022) — lesson_1_1
  ('00000000-0000-0000-0000-000000000040',
   '00000000-0000-0000-0000-000000000030',
   'multiple_choice',
   'Yesterday I ___ to the cinema with my friends.',
   '{"options": ["went", "have gone", "going", "gone"]}'::jsonb,
   0),

  -- 3.2 Fill-in-blank (FR-018) — lesson_1_2
  ('00000000-0000-0000-0000-000000000041',
   '00000000-0000-0000-0000-000000000031',
   'fill_in_blank',
   'Complete the sentence: She has lived in London ___ five years.',
   '{"template": "She has lived in London ___ five years."}'::jsonb,
   0),

  -- 3.3 True/false (FR-023) — lesson_2_1
  ('00000000-0000-0000-0000-000000000042',
   '00000000-0000-0000-0000-000000000033',
   'true_false',
   'The Present Perfect is used for completed actions at a specific past time.',
   '{}'::jsonb,
   0),

  -- 3.4 Sentence transformation (FR-020) — lesson_2_2, ord 0
  ('00000000-0000-0000-0000-000000000043',
   '00000000-0000-0000-0000-000000000034',
   'sentence_transformation',
   'Transform the sentence keeping the meaning the same. Original: "She didn''t have enough money to buy the car." Begin with: "She had too..."',
   '{"original": "She didn''t have enough money to buy the car.", "begin_with": "She had too"}'::jsonb,
   0),

  -- 3.5 Open-ended (FR-021) — lesson_2_2, ord 1
  ('00000000-0000-0000-0000-000000000044',
   '00000000-0000-0000-0000-000000000034',
   'open_ended',
   'Describe your typical morning routine in 3-4 sentences (use Present Simple).',
   '{}'::jsonb,
   1);

-- Exercise keys (FR-024: list of acceptable variants)
insert into public.exercise_keys (id, exercise_id, key_text, key_metadata, ord) values
  -- 3.1 MC: single correct option
  ('00000000-0000-0000-0000-000000000050',
   '00000000-0000-0000-0000-000000000040',
   'went', null, 0),

  -- 3.2 fill_in_blank: 3 acceptable variants
  ('00000000-0000-0000-0000-000000000051',
   '00000000-0000-0000-0000-000000000041',
   'for', null, 0),
  ('00000000-0000-0000-0000-000000000052',
   '00000000-0000-0000-0000-000000000041',
   'for the last', null, 1),
  ('00000000-0000-0000-0000-000000000053',
   '00000000-0000-0000-0000-000000000041',
   'for the past', null, 2),

  -- 3.3 true_false: correct answer is false (Past Simple, not Present Perfect)
  ('00000000-0000-0000-0000-000000000054',
   '00000000-0000-0000-0000-000000000042',
   'false', null, 0),

  -- 3.4 sentence_transformation: 2 acceptable variants
  ('00000000-0000-0000-0000-000000000055',
   '00000000-0000-0000-0000-000000000043',
   'She had too little money to buy the car.', null, 0),
  ('00000000-0000-0000-0000-000000000056',
   '00000000-0000-0000-0000-000000000043',
   'She had so little money that she couldn''t buy the car.', null, 1),

  -- 3.5 open_ended: reference answer for self-assessment (not a variant; FR-025)
  ('00000000-0000-0000-0000-000000000057',
   '00000000-0000-0000-0000-000000000044',
   'Sample answer: I usually wake up at 7 AM, take a shower, and make breakfast. Then I read the news while drinking coffee before leaving for work around 8:30.',
   '{"is_reference_only": true}'::jsonb,
   0);
