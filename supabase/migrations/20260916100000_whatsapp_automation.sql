-- WhatsApp Customer Communication Automation.
-- Purely additive: new tables only, nothing existing is altered.
-- Accessed exclusively through lib/db/client.ts's withServiceRole() from
-- trusted server-side automation code — never through the RLS-enforcing
-- withUserContext() path, so no grants to `authenticated` are added here.

create table if not exists public.whatsapp_auth_state (
  id text primary key,
  creds jsonb,
  keys jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_messages (
  id bigint generated always as identity primary key,
  booking_id bigint references public.bookings(id) on delete cascade,
  customer_id bigint references public.customers(id) on delete set null,
  message_type text not null check (
    message_type in (
      'booking_confirmed',
      'invoice',
      'payment_received',
      'full_payment_completed',
      'thank_you_feedback'
    )
  ),
  to_number text not null,
  body text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists whatsapp_messages_booking_type_idx
  on public.whatsapp_messages (booking_id, message_type, status);

create table if not exists public.booking_feedback (
  id bigint generated always as identity primary key,
  booking_id bigint not null references public.bookings(id) on delete cascade,
  customer_id bigint references public.customers(id) on delete set null,
  rating integer check (rating between 1 and 5),
  experience text,
  comment text,
  suggestions text,
  created_at timestamptz not null default now()
);

create index if not exists booking_feedback_booking_idx
  on public.booking_feedback (booking_id);
