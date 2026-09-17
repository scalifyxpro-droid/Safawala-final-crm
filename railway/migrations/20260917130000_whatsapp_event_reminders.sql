-- Adds the two new automatic event-reminder message types (7 days before,
-- 1 day before) to the WhatsApp Customer Communication automation.
-- Purely additive: widens the existing message_type check constraint on
-- public.whatsapp_messages only — no other table, column or existing row
-- is touched.
--
-- The old constraint is looked up by its actual definition (rather than
-- guessed by Postgres's default auto-generated name) and dropped
-- dynamically, so this can never silently leave the old, narrower
-- constraint active alongside the new one.

do $$
declare
  old_constraint text;
begin
  select con.conname into old_constraint
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'whatsapp_messages'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%message_type%'
  limit 1;

  if old_constraint is not null then
    execute format('alter table public.whatsapp_messages drop constraint %I', old_constraint);
  end if;
end $$;

alter table public.whatsapp_messages
  add constraint whatsapp_messages_message_type_check
  check (
    message_type in (
      'booking_confirmed',
      'invoice',
      'payment_received',
      'full_payment_completed',
      'thank_you_feedback',
      'event_reminder_7d',
      'event_reminder_1d'
    )
  );
