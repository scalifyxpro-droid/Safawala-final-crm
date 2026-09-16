-- Safawala CRM internal team chat.
-- Messages are scoped to one CRM owner and are accessed only by the trusted
-- server API, which validates the signed admin/staff session for every call.

create table if not exists public.team_chat_messages (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  channel_type text not null check (channel_type in ('everyone', 'direct')),
  sender_key text not null,
  sender_name text not null,
  recipient_key text,
  body text not null check (length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (
    (channel_type = 'everyone' and recipient_key is null)
    or (channel_type = 'direct' and recipient_key is not null and recipient_key <> sender_key)
  )
);

create index if not exists team_chat_messages_owner_created_idx
  on public.team_chat_messages (owner_id, created_at desc);

create index if not exists team_chat_messages_direct_idx
  on public.team_chat_messages (owner_id, sender_key, recipient_key, created_at desc)
  where channel_type = 'direct';

create table if not exists public.team_chat_reads (
  owner_id uuid not null references auth.users(id) on delete cascade,
  reader_key text not null,
  channel_key text not null,
  last_read_message_id bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (owner_id, reader_key, channel_key)
);

create table if not exists public.team_chat_presence (
  owner_id uuid not null references auth.users(id) on delete cascade,
  member_key text not null,
  last_seen_at timestamptz not null default now(),
  primary key (owner_id, member_key)
);

alter table public.team_chat_messages enable row level security;
alter table public.team_chat_reads enable row level security;
alter table public.team_chat_presence enable row level security;

comment on table public.team_chat_messages is
  'Internal Safawala CRM team messages, isolated per CRM owner.';
