create extension if not exists pgcrypto;

create table if not exists public.community_registrations (
  id uuid primary key default gen_random_uuid(),
  product_id text not null unique
    check (product_id ~ '^LFA-CE-[2-9A-HJ-NP-Z]{8}$'),
  business_name text not null,
  contact_name text not null,
  email text not null,
  business_type text,
  edition text not null default 'community'
    check (edition = 'community'),
  terms_accepted boolean not null
    check (terms_accepted),
  terms_version text not null,
  privacy_version text not null,
  feedback_consent boolean not null default false,
  registered_at timestamptz not null default now(),
  survey_due_at timestamptz,
  survey_status text not null default 'not_due'
    check (survey_status in ('not_due', 'due', 'sent', 'completed', 'declined')),
  welcome_status text not null default 'pending'
    check (welcome_status in ('pending', 'sent', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists community_registrations_survey_due_idx
  on public.community_registrations (survey_due_at, survey_status)
  where feedback_consent = true;

alter table public.community_registrations enable row level security;

comment on table public.community_registrations is
  'Business-level Community Edition registrations only. Customer loyalty records must never be stored here.';

