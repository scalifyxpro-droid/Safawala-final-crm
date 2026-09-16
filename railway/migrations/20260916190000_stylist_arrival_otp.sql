create table if not exists public.stylist_arrival_otp (
  job_id text not null references public.event_jobs(id) on delete cascade,
  stylist_account_id text not null,
  code_hash text not null,
  salt text not null,
  expires_at timestamptz not null,
  sent_at timestamptz not null default now(),
  attempts integer not null default 0,
  primary key (job_id, stylist_account_id)
);

create index if not exists stylist_arrival_otp_expires_at_idx
  on public.stylist_arrival_otp (expires_at);

alter table public.stylist_arrival_otp enable row level security;
