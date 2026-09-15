--
-- PostgreSQL database dump
--

-- Dumped from database version 16.13 (Ubuntu 16.13-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.13 (Ubuntu 16.13-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: assign_booking_document_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assign_booking_document_number() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  new.booking_number := public.next_document_number(
    new.owner_id,
    new.is_quote,
    new.booking_type
  );
  return new;
end;
$$;


--
-- Name: block_staff_payment_writes(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.block_staff_payment_writes() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if exists(select 1 from public.staff_members sm where sm.user_id=(select auth.uid()) and sm.access_type='staff') then
    raise exception 'Staff IDs cannot record payments';
  end if;
  return new;
end
$$;


--
-- Name: booking_confirmation_opens_event_job(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.booking_confirmation_opens_event_job() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if new.status='confirmed' and not new.is_quote and (tg_op='INSERT' or old.status is distinct from new.status) then
    perform public.open_event_job(new.id);
  end if;
  return new;
end $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: bookings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bookings (
    id bigint NOT NULL,
    owner_id uuid NOT NULL,
    booking_number text NOT NULL,
    booking_type text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    payment_status text DEFAULT 'unpaid'::text NOT NULL,
    customer_id bigint NOT NULL,
    assigned_staff_id bigint,
    event_name text NOT NULL,
    event_date date NOT NULL,
    event_time time without time zone,
    event_location text,
    pickup_date date,
    due_date date,
    returned_at timestamp with time zone,
    notes text,
    subtotal numeric(12,2) DEFAULT 0 NOT NULL,
    discount numeric(12,2) DEFAULT 0 NOT NULL,
    tax numeric(12,2) DEFAULT 0 NOT NULL,
    security_deposit numeric(12,2) DEFAULT 0 NOT NULL,
    total numeric(12,2) DEFAULT 0 NOT NULL,
    paid_amount numeric(12,2) DEFAULT 0 NOT NULL,
    balance_amount numeric(12,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_quote boolean DEFAULT false NOT NULL,
    contact_name text,
    alternate_mobile text,
    created_by_staff_id bigint,
    source_quote_id bigint,
    converted_booking_id bigint,
    bride_name text,
    bride_mobile text,
    groom_name text,
    groom_mobile text,
    contact_address text,
    CONSTRAINT bookings_balance_amount_check CHECK ((balance_amount >= (0)::numeric)),
    CONSTRAINT bookings_booking_type_check CHECK ((booking_type = ANY (ARRAY['sale'::text, 'rental'::text]))),
    CONSTRAINT bookings_check CHECK (((booking_type = 'rental'::text) OR ((pickup_date IS NULL) AND (due_date IS NULL)))),
    CONSTRAINT bookings_check1 CHECK (((booking_type = 'sale'::text) OR ((pickup_date IS NOT NULL) AND (due_date IS NOT NULL) AND (due_date >= pickup_date)))),
    CONSTRAINT bookings_discount_check CHECK ((discount >= (0)::numeric)),
    CONSTRAINT bookings_event_name_check CHECK ((length(TRIM(BOTH FROM event_name)) >= 2)),
    CONSTRAINT bookings_paid_amount_check CHECK ((paid_amount >= (0)::numeric)),
    CONSTRAINT bookings_payment_status_check CHECK ((payment_status = ANY (ARRAY['unpaid'::text, 'partial'::text, 'paid'::text, 'refunded'::text]))),
    CONSTRAINT bookings_security_deposit_check CHECK ((security_deposit >= (0)::numeric)),
    CONSTRAINT bookings_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'confirmed'::text, 'ready'::text, 'out_for_delivery'::text, 'active'::text, 'completed'::text, 'cancelled'::text]))),
    CONSTRAINT bookings_subtotal_check CHECK ((subtotal >= (0)::numeric)),
    CONSTRAINT bookings_tax_check CHECK ((tax >= (0)::numeric)),
    CONSTRAINT bookings_total_check CHECK ((total >= (0)::numeric))
);


--
-- Name: change_booking_status(bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.change_booking_status(booking_key bigint, next_status text) RETURNS public.bookings
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare caller uuid := public.current_booking_owner(); current_booking public.bookings; updated_booking public.bookings;
begin
  select * into current_booking from public.bookings where id = booking_key and owner_id = caller for update;
  if current_booking.id is null then raise exception 'Booking not found'; end if;
  if next_status not in ('draft','confirmed','ready','out_for_delivery','active','completed','cancelled') then raise exception 'Invalid booking status'; end if;
  if current_booking.status in ('completed','cancelled') then raise exception 'A closed booking cannot change status'; end if;
  if current_booking.booking_type = 'rental' and not (
    (current_booking.status = 'draft' and next_status in ('confirmed','cancelled')) or
    (current_booking.status = 'confirmed' and next_status in ('ready','cancelled')) or
    (current_booking.status = 'ready' and next_status in ('out_for_delivery','active','cancelled')) or
    (current_booking.status = 'out_for_delivery' and next_status in ('active','cancelled')) or
    (current_booking.status = 'active' and next_status = 'completed')
  ) then raise exception 'Invalid rental status transition'; end if;
  update public.bookings set status = next_status where id = booking_key returning * into updated_booking;
  insert into public.booking_activity (owner_id, booking_id, action, details)
  values (caller, booking_key, 'status_changed', jsonb_build_object('from', current_booking.status, 'to', next_status));
  return updated_booking;
end;
$$;


--
-- Name: configure_staff_type(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.configure_staff_type(staff_user_id uuid, requested_type text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  target_staff_id bigint;
begin
  if requested_type not in ('regular', 'stylist') then
    raise exception 'Invalid staff type';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'
  ) then
    raise exception 'Only an administrator can manage staff types';
  end if;

  select sm.id into target_staff_id
  from public.staff_members sm
  where sm.user_id = staff_user_id and sm.owner_id = (select auth.uid());
  if target_staff_id is null then raise exception 'Staff portal account was not found'; end if;

  update public.staff_members
  set staff_type = requested_type, access_type = 'staff'
  where id = target_staff_id;
  delete from public.staff_departments where staff_id = target_staff_id;
  insert into public.staff_departments(staff_id, department, granted_by)
  values(target_staff_id, case when requested_type = 'stylist' then 'stylist' else 'booking' end, (select auth.uid()));
  delete from public.staff_access_modules where staff_id = target_staff_id;
  if requested_type = 'regular' then
    insert into public.staff_access_modules(owner_id, staff_id, module, enabled)
    values
      ((select auth.uid()), target_staff_id, 'quotations', true),
      ((select auth.uid()), target_staff_id, 'create_booking', true);
  end if;
end;
$$;


--
-- Name: convert_quote_to_booking(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.convert_quote_to_booking(quote_key bigint) RETURNS public.bookings
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  actor uuid := (select auth.uid());
  owner_key uuid;
  actor_staff_id bigint;
  actor_access_type text;
  source_quote public.bookings;
  created_booking public.bookings;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if exists(select 1 from public.profiles where id=actor and role='admin') then
    owner_key := actor;
  else
    select id,owner_id,access_type into actor_staff_id,owner_key,actor_access_type
    from public.staff_members where user_id=actor and portal_active and is_active limit 1;
    if actor_staff_id is null or actor_access_type<>'main'
      or not public.staff_can_access('quotations') or not public.staff_can_access('bookings') then
      raise exception 'Only an authorized Main ID can convert a quote';
    end if;
  end if;

  select * into source_quote from public.bookings
  where id=quote_key and owner_id=owner_key and is_quote for update;
  if source_quote.id is null then raise exception 'Quote not found'; end if;
  if source_quote.converted_booking_id is not null then
    select * into created_booking from public.bookings where id=source_quote.converted_booking_id;
    return created_booking;
  end if;
  if source_quote.status<>'draft' then raise exception 'Only a generated quote can be converted'; end if;

  insert into public.bookings(
    owner_id,booking_number,booking_type,status,payment_status,is_quote,customer_id,
    assigned_staff_id,created_by_staff_id,event_name,event_date,event_time,event_location,
    contact_name,alternate_mobile,pickup_date,due_date,notes,subtotal,discount,tax,
    security_deposit,total,paid_amount,balance_amount,source_quote_id
  ) values (
    owner_key,'PENDING',source_quote.booking_type,'confirmed','unpaid',false,source_quote.customer_id,
    source_quote.assigned_staff_id,source_quote.created_by_staff_id,source_quote.event_name,
    source_quote.event_date,source_quote.event_time,source_quote.event_location,source_quote.contact_name,
    source_quote.alternate_mobile,source_quote.pickup_date,source_quote.due_date,source_quote.notes,
    source_quote.subtotal,source_quote.discount,source_quote.tax,source_quote.security_deposit,
    source_quote.total,0,source_quote.total,source_quote.id
  ) returning * into created_booking;

  insert into public.booking_items(
    owner_id,booking_id,product_id,package_id,package_variant_id,item_name,quantity,unit_price,security_deposit
  ) select owner_key,created_booking.id,product_id,package_id,package_variant_id,item_name,quantity,unit_price,security_deposit
    from public.booking_items where booking_id=source_quote.id;

  update public.bookings set status='confirmed',converted_booking_id=created_booking.id
  where id=source_quote.id;

  insert into public.booking_activity(owner_id,booking_id,action,details) values
    (owner_key,source_quote.id,'quote_converted',jsonb_build_object('booking_id',created_booking.id,'booking_number',created_booking.booking_number,'converted_by',actor_staff_id)),
    (owner_key,created_booking.id,'booking_created_from_quote',jsonb_build_object('quote_id',source_quote.id,'quote_number',source_quote.booking_number,'converted_by',actor_staff_id));
  return created_booking;
end;
$$;


--
-- Name: create_booking(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_booking(payload jsonb) RETURNS public.bookings
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  actor uuid := (select auth.uid());
  actor_role text;
  owner_key uuid;
  actor_staff_id bigint;
  actor_access_type text;
  customer_key bigint;
  assigned_staff_key bigint;
  created_booking public.bookings;
  calculated_subtotal numeric(12,2);
  calculated_deposit numeric(12,2);
  discount_value numeric(12,2) := greatest(coalesce((payload ->> 'discount')::numeric,0),0);
  tax_value numeric(12,2) := greatest(coalesce((payload ->> 'tax')::numeric,0),0);
  paid_value numeric(12,2) := greatest(coalesce((payload ->> 'paid_amount')::numeric,0),0);
  quote_requested boolean := coalesce((payload ->> 'is_quote')::boolean,false);
  booking_kind text := case when payload ->> 'booking_type'='rental' then 'rental' else 'sale' end;
  row_item jsonb;
  variant_key bigint;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  select role into actor_role from public.profiles where id=actor;

  if actor_role='admin' then
    owner_key := actor;
  elsif actor_role='staff' then
    select id,owner_id,access_type into actor_staff_id,owner_key,actor_access_type
    from public.staff_members
    where user_id=actor and portal_active and is_active limit 1;
    if actor_staff_id is null then raise exception 'Active staff access is required'; end if;
    if actor_access_type='staff' then
      if not quote_requested then raise exception 'Staff IDs can save quotations only'; end if;
      discount_value := 0; tax_value := 0; paid_value := 0;
      assigned_staff_key := actor_staff_id;
    else
      if not public.staff_can_access('create_booking') then raise exception 'Create booking access denied'; end if;
      if quote_requested and not public.staff_can_access('quotations') then raise exception 'Quotation access denied'; end if;
      if not quote_requested and not public.staff_can_access('bookings') then raise exception 'Booking access denied'; end if;
    end if;
  else
    raise exception 'Booking access denied';
  end if;

  if jsonb_array_length(coalesce(payload -> 'items','[]'::jsonb))=0 then
    raise exception 'At least one booking item is required';
  end if;
  if booking_kind='rental' and nullif(trim(payload ->> 'contact_name'),'') is null then
    raise exception 'Contact name is required for rental bookings';
  end if;
  if booking_kind='rental' and coalesce(payload ->> 'alternate_mobile','') !~ '^[0-9]{10}$' then
    raise exception 'A valid 10-digit alternate mobile number is required for rental bookings';
  end if;

  if nullif(payload ->> 'customer_id','') is not null then
    select id into customer_key from public.customers
    where id=(payload ->> 'customer_id')::bigint and owner_id=owner_key;
  else
    insert into public.customers(owner_id,name,phone,email,address)
    values(owner_key,trim(payload #>> '{customer,name}'),trim(payload #>> '{customer,phone}'),
      nullif(trim(payload #>> '{customer,email}'),''),nullif(trim(payload #>> '{customer,address}'),''))
    on conflict(owner_id,phone) do update set
      name=excluded.name,
      email=coalesce(excluded.email,public.customers.email),
      address=coalesce(excluded.address,public.customers.address)
    returning id into customer_key;
  end if;
  if customer_key is null then raise exception 'A valid customer is required'; end if;

  if assigned_staff_key is null and nullif(payload ->> 'assigned_staff_id','') is not null then
    select id into assigned_staff_key from public.staff_members
    where id=(payload ->> 'assigned_staff_id')::bigint and owner_id=owner_key and is_active;
    if assigned_staff_key is null then raise exception 'Selected staff member is unavailable'; end if;
  end if;

  select coalesce(sum((item ->> 'quantity')::integer*(item ->> 'unit_price')::numeric),0),
         coalesce(sum(coalesce((item ->> 'security_deposit')::numeric,0)),0)
  into calculated_subtotal,calculated_deposit
  from jsonb_array_elements(payload -> 'items') item;

  if paid_value > greatest(calculated_subtotal-discount_value+tax_value+calculated_deposit,0) then
    raise exception 'Paid amount cannot exceed booking total';
  end if;

  insert into public.bookings(
    owner_id,booking_number,booking_type,status,payment_status,is_quote,customer_id,
    assigned_staff_id,created_by_staff_id,event_name,event_date,event_time,event_location,
    contact_name,alternate_mobile,pickup_date,due_date,notes,subtotal,discount,tax,
    security_deposit,total,paid_amount,balance_amount
  ) values (
    owner_key,'PENDING',booking_kind,case when quote_requested then 'draft' else 'confirmed' end,
    case when quote_requested or paid_value=0 then 'unpaid'
      when paid_value>=greatest(calculated_subtotal-discount_value+tax_value+calculated_deposit,0) then 'paid'
      else 'partial' end,
    quote_requested,customer_key,assigned_staff_key,actor_staff_id,trim(payload ->> 'event_name'),
    (payload ->> 'event_date')::date,nullif(payload ->> 'event_time','')::time,
    nullif(trim(payload ->> 'event_location'),''),
    case when booking_kind='rental' then nullif(trim(payload ->> 'contact_name'),'') else null end,
    case when booking_kind='rental' then payload ->> 'alternate_mobile' else null end,
    nullif(payload ->> 'pickup_date','')::date,nullif(payload ->> 'due_date','')::date,
    nullif(trim(payload ->> 'notes'),''),calculated_subtotal,discount_value,tax_value,
    calculated_deposit,greatest(calculated_subtotal-discount_value+tax_value+calculated_deposit,0),
    case when quote_requested then 0 else paid_value end,
    greatest(calculated_subtotal-discount_value+tax_value+calculated_deposit
      - case when quote_requested then 0 else paid_value end,0)
  ) returning * into created_booking;

  for row_item in select * from jsonb_array_elements(payload -> 'items') loop
    variant_key := nullif(row_item ->> 'package_variant_id','')::bigint;
    if variant_key is not null and not exists(
      select 1 from public.package_variants where id=variant_key and owner_id=owner_key
    ) then raise exception 'A selected rental package is unavailable'; end if;

    insert into public.booking_items(
      owner_id,booking_id,product_id,package_id,package_variant_id,item_name,quantity,unit_price,security_deposit
    ) values (
      owner_key,created_booking.id,nullif(row_item ->> 'product_id','')::bigint,
      nullif(row_item ->> 'package_id','')::bigint,variant_key,trim(row_item ->> 'item_name'),
      (row_item ->> 'quantity')::integer,(row_item ->> 'unit_price')::numeric,
      greatest(coalesce((row_item ->> 'security_deposit')::numeric,0),0)
    );
  end loop;

  if not quote_requested and paid_value>0 then
    insert into public.booking_payments(owner_id,booking_id,amount,payment_method,reference_number)
    values(owner_key,created_booking.id,paid_value,
      coalesce(nullif(payload ->> 'payment_method',''),'cash'),nullif(payload ->> 'payment_reference',''));
  end if;

  insert into public.booking_activity(owner_id,booking_id,action,details)
  values(owner_key,created_booking.id,case when quote_requested then 'quote_saved' else 'booking_created' end,
    jsonb_build_object('status',created_booking.status,'total',created_booking.total,'created_by_staff_id',actor_staff_id));
  return created_booking;
end;
$_$;


--
-- Name: create_booking_quote(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_booking_quote(payload jsonb) RETURNS public.bookings
    LANGUAGE sql
    SET search_path TO ''
    AS $$
  select public.create_booking(payload || jsonb_build_object('paid_amount',0,'is_quote',true));
$$;


--
-- Name: current_booking_owner(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_booking_owner() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select case when p.role='admin' then p.id
    when p.role='staff' and (public.staff_can_access('quotations') or public.staff_can_access('bookings') or public.staff_can_access('create_booking'))
      then public.current_staff_owner() else null end
  from public.profiles p where p.id=(select auth.uid()) limit 1
$$;


--
-- Name: current_staff_has_department(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_staff_has_department(required_department text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (
    select 1 from public.staff_members sm
    join public.staff_departments sd on sd.staff_id = sm.id
    where sm.user_id = (select auth.uid()) and sm.portal_active and sm.is_active
      and sd.department = required_department
  )
$$;


--
-- Name: current_staff_member_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_staff_member_id() RETURNS bigint
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select id from public.staff_members where user_id=(select auth.uid()) and portal_active and is_active limit 1
$$;


--
-- Name: current_staff_owner(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_staff_owner() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select sm.owner_id from public.staff_members sm
  where sm.user_id = (select auth.uid()) and sm.portal_active and sm.is_active
  limit 1
$$;


--
-- Name: enforce_quote_only_staff(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_quote_only_staff() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  account_id bigint;
  account_type text;
begin
  select sm.id,sm.access_type into account_id,account_type
  from public.staff_members sm
  where sm.user_id=(select auth.uid()) and sm.portal_active and sm.is_active
  limit 1;

  if account_type='staff' then
    if not exists(
      select 1 from public.staff_departments sd
      where sd.staff_id=account_id and sd.department='booking'
    ) then
      raise exception 'Quote creation requires an active Booking department assignment';
    end if;
    if new.is_quote is not true then
      raise exception 'Staff IDs can save quotations only';
    end if;
    if coalesce(new.paid_amount,0)<>0 or coalesce(new.discount,0)<>0 or coalesce(new.tax,0)<>0 then
      raise exception 'Staff IDs cannot edit payment, discount or tax details';
    end if;
  end if;
  return new;
end
$$;


--
-- Name: enforce_stylist_interest_rules(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_stylist_interest_rules() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  required_count integer;
  approved_count integer;
  rental_job boolean;
  valid_stylist boolean;
begin
  if tg_op = 'UPDATE'
    and old.event_job_id is not distinct from new.event_job_id
    and old.staff_id is not distinct from new.staff_id
    and old.status is not distinct from new.status then
    return new;
  end if;

  select
    greatest(j.stylists_required_count, 0),
    j.status = 'active' and j.state->>'bookingType' = 'rental'
  into required_count, rental_job
  from public.event_jobs j
  where j.id = new.event_job_id
  for update;

  select exists (
    select 1 from public.staff_members sm
    where sm.id = new.staff_id
      and sm.staff_type = 'stylist'
      and sm.portal_active
      and sm.is_active
  ) into valid_stylist;

  if not coalesce(rental_job, false) then
    raise exception 'Stylist interest is available only for active rental events';
  end if;
  if not coalesce(valid_stylist, false) then
    raise exception 'Only an active stylist account can participate';
  end if;

  if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    select count(*) into approved_count
    from public.event_job_stylist_interest i
    where i.event_job_id = new.event_job_id
      and i.status = 'approved'
      and i.id <> new.id;
    if approved_count >= required_count then
      raise exception 'The required stylist count has already been filled';
    end if;
  end if;

  return new;
end;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;


--
-- Name: keep_staff_portal_state_consistent(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.keep_staff_portal_state_consistent() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if tg_op = 'INSERT' then
    if new.portal_active then
      new.is_active := true;
    end if;
    return new;
  end if;

  if new.portal_active is distinct from old.portal_active and new.portal_active then
    new.is_active := true;
  elsif new.is_active is distinct from old.is_active and not new.is_active then
    new.portal_active := false;
  end if;
  return new;
end;
$$;


--
-- Name: next_document_number(uuid, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.next_document_number(caller uuid, quote_requested boolean, booking_kind text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  actor uuid := (select auth.uid());
  series_key text;
  fallback_prefix text;
  settings_row public.document_number_settings;
  default_year integer := extract(year from current_date)::integer;
  candidate integer;
  generated text;
begin
  if actor is null or caller is null then raise exception 'Authentication required'; end if;
  if actor <> caller and not exists (
    select 1 from public.staff_members sm
    where sm.user_id=actor and sm.owner_id=caller and sm.portal_active and sm.is_active
      and (sm.access_type='main' or (sm.access_type='staff' and quote_requested))
  ) then
    raise exception 'Document number access denied';
  end if;

  series_key := case
    when quote_requested and booking_kind = 'rental' then 'rental_quote'
    when quote_requested then 'sale_quote'
    when booking_kind = 'rental' then 'rental_booking'
    else 'sale_booking'
  end;
  fallback_prefix := case series_key
    when 'rental_quote' then 'SW-Q-R-'
    when 'sale_quote' then 'SW-Q-S-'
    when 'rental_booking' then 'SW-R-'
    else 'SW-S-'
  end;

  insert into public.document_number_settings (
    owner_id, series, prefix, next_number, number_padding, sequence_year
  ) values (
    caller, series_key, fallback_prefix, 1, 4, default_year
  ) on conflict (owner_id, series) do nothing;

  select * into settings_row
  from public.document_number_settings
  where owner_id=caller and series=series_key
  for update;

  candidate := settings_row.next_number;
  loop
    generated := settings_row.prefix || settings_row.sequence_year::text || '-'
      || lpad(candidate::text, settings_row.number_padding, '0');
    exit when not exists (select 1 from public.bookings where booking_number=generated);
    candidate := candidate + 1;
    if candidate > 99999999 then raise exception 'Document number range is exhausted'; end if;
  end loop;

  update public.document_number_settings
  set next_number=candidate + 1
  where owner_id=caller and series=series_key;
  return generated;
end;
$$;


--
-- Name: open_event_job(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.open_event_job(booking_key bigint) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare b public.bookings%rowtype; jid text; now_at timestamptz:=now();
begin
  select * into b from public.bookings where id=booking_key;
  if b.id is null or b.is_quote or b.status <> 'confirmed' then return null; end if;
  jid := 'JOB-' || case when b.booking_type='sale' then 'S' else 'R' end || '-' ||
    coalesce(substring(b.booking_number from '(\d{4}-\d+)$'), 'B' || b.id::text);
  insert into public.event_jobs(id,booking_id,owner_id,job_number,status,created_at,updated_at)
  values(jid,b.id,b.owner_id,jid,'active',now_at,now_at) on conflict(booking_id) do nothing;
  insert into public.event_job_stages(event_job_id,stage,status,opened_at)
  select jid, s,
    case when b.booking_type='sale' and s in ('collection','return_quality_check','return_warehouse') then 'done'
         when s in ('warehouse_pick','stylist_opportunity') then 'open' else 'not_started' end,
    case when s in ('warehouse_pick','stylist_opportunity') then now_at else null end
  from unnest(array['warehouse_pick','quality_check','packing','stylist_opportunity','collection','return_quality_check','return_warehouse','booking_final_check']) s
  on conflict(event_job_id,stage) do nothing;
  return jid;
end $_$;


--
-- Name: process_rental_return(bigint, numeric, numeric, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.process_rental_return(booking_key bigint, damage numeric DEFAULT 0, late numeric DEFAULT 0, condition_text text DEFAULT NULL::text) RETURNS public.bookings
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare caller uuid := public.current_booking_owner(); current_booking public.bookings; refund numeric(12,2); updated_booking public.bookings;
begin
  select * into current_booking from public.bookings where id = booking_key and owner_id = caller for update;
  if current_booking.id is null or current_booking.booking_type <> 'rental' then raise exception 'Rental booking not found'; end if;
  if current_booking.status <> 'active' then raise exception 'Only active rentals can be returned'; end if;
  if damage < 0 or late < 0 then raise exception 'Charges cannot be negative'; end if;
  refund := greatest(current_booking.security_deposit - damage - late, 0);
  insert into public.rental_returns (owner_id, booking_id, condition_notes, damage_charge, late_charge, refund_amount) values (caller, booking_key, nullif(condition_text, ''), damage, late, refund);
  update public.bookings set status = 'completed', returned_at = now() where id = booking_key returning * into updated_booking;
  insert into public.booking_activity (owner_id, booking_id, action, details) values (caller, booking_key, 'rental_returned', jsonb_build_object('damage_charge', damage, 'late_charge', late, 'refund_amount', refund));
  return updated_booking;
end;
$$;


--
-- Name: protect_profile_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.protect_profile_role() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if old.role is distinct from new.role and (select auth.uid()) is not null and (select auth.uid()) = old.id then
    raise exception 'Profile roles can only be changed by the server administrator';
  end if;
  return new;
end $$;


--
-- Name: record_booking_payment(bigint, numeric, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_booking_payment(booking_key bigint, payment_amount numeric, method text, reference text DEFAULT NULL::text) RETURNS public.bookings
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare caller uuid := public.current_booking_owner(); current_booking public.bookings; new_paid numeric(12,2); updated_booking public.bookings;
begin
  select * into current_booking from public.bookings where id = booking_key and owner_id = caller for update;
  if current_booking.id is null then raise exception 'Booking not found'; end if;
  if payment_amount <= 0 or current_booking.paid_amount + payment_amount > current_booking.total then raise exception 'Payment amount is invalid'; end if;
  if method not in ('cash','card','upi','bank_transfer','other') then raise exception 'Invalid payment method'; end if;
  insert into public.booking_payments (owner_id, booking_id, amount, payment_method, reference_number) values (caller, booking_key, payment_amount, method, nullif(reference, ''));
  new_paid := current_booking.paid_amount + payment_amount;
  update public.bookings set paid_amount = new_paid, balance_amount = total - new_paid, payment_status = case when new_paid >= total then 'paid' else 'partial' end where id = booking_key returning * into updated_booking;
  insert into public.booking_activity (owner_id, booking_id, action, details) values (caller, booking_key, 'payment_recorded', jsonb_build_object('amount', payment_amount, 'method', method));
  return updated_booking;
end;
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: staff_can_access(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.staff_can_access(requested_module text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists(
    select 1
    from public.staff_members sm
    where sm.user_id=(select auth.uid())
      and sm.portal_active
      and sm.is_active
      and (
        (
          sm.access_type='staff'
          and requested_module in ('quotations','create_booking')
          and exists(
            select 1 from public.staff_departments sd
            where sd.staff_id=sm.id and sd.department='booking'
          )
        )
        or (
          sm.access_type='main'
          and exists(
            select 1 from public.staff_access_modules sam
            where sam.staff_id=sm.id
              and sam.owner_id=sm.owner_id
              and sam.module=requested_module
              and sam.enabled
          )
        )
      )
  )
$$;


--
-- Name: staff_can_access_any(text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.staff_can_access_any(requested_modules text[]) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists(select 1 from unnest(requested_modules) module where public.staff_can_access(module))
$$;


--
-- Name: update_booking_details(bigint, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_booking_details(booking_key bigint, payload jsonb) RETURNS public.bookings
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $_$
declare
  caller uuid := public.current_booking_owner();
  current_booking public.bookings;
  customer_key bigint;
  calculated_subtotal numeric(12,2);
  calculated_deposit numeric(12,2);
  discount_value numeric(12,2) := greatest(coalesce((payload ->> 'discount')::numeric, 0), 0);
  tax_value numeric(12,2) := greatest(coalesce((payload ->> 'tax')::numeric, 0), 0);
  row_item jsonb;
  variant_key bigint;
  updated_booking public.bookings;
begin
  if caller is null then raise exception 'Authentication required'; end if;
  select * into current_booking from public.bookings
  where id = booking_key and owner_id = caller for update;
  if current_booking.id is null then raise exception 'Booking not found'; end if;
  if current_booking.paid_amount > 0 then
    raise exception 'Items cannot be edited once a payment has been recorded';
  end if;
  if current_booking.status in ('completed', 'cancelled') then
    raise exception 'A closed booking cannot be edited';
  end if;
  if jsonb_array_length(coalesce(payload -> 'items', '[]'::jsonb)) = 0 then
    raise exception 'At least one booking item is required';
  end if;
  if current_booking.booking_type = 'rental' and nullif(trim(payload ->> 'contact_name'), '') is null then
    raise exception 'Contact name is required for rental bookings';
  end if;
  if current_booking.booking_type = 'rental' and coalesce(payload ->> 'alternate_mobile', '') !~ '^[0-9]{10}$' then
    raise exception 'A valid 10-digit alternate mobile number is required for rental bookings';
  end if;

  if nullif(payload ->> 'customer_id', '') is not null then
    select id into customer_key from public.customers
    where id = (payload ->> 'customer_id')::bigint and owner_id = caller;
  else
    customer_key := current_booking.customer_id;
  end if;
  if customer_key is null then raise exception 'A valid customer is required'; end if;

  select coalesce(sum((item ->> 'quantity')::integer * (item ->> 'unit_price')::numeric), 0),
         coalesce(sum(coalesce((item ->> 'security_deposit')::numeric, 0)), 0)
  into calculated_subtotal, calculated_deposit
  from jsonb_array_elements(payload -> 'items') item;

  update public.bookings set
    customer_id = customer_key,
    assigned_staff_id = nullif(payload ->> 'assigned_staff_id', '')::bigint,
    event_name = trim(payload ->> 'event_name'),
    event_date = (payload ->> 'event_date')::date,
    event_time = nullif(payload ->> 'event_time', '')::time,
    event_location = nullif(trim(payload ->> 'event_location'), ''),
    contact_name = case when current_booking.booking_type = 'rental'
      then nullif(trim(payload ->> 'contact_name'), '') else null end,
    alternate_mobile = case when current_booking.booking_type = 'rental'
      then payload ->> 'alternate_mobile' else null end,
    pickup_date = case when current_booking.booking_type = 'rental'
      then nullif(payload ->> 'pickup_date', '')::date else null end,
    due_date = case when current_booking.booking_type = 'rental'
      then nullif(payload ->> 'due_date', '')::date else null end,
    notes = nullif(trim(payload ->> 'notes'), ''),
    subtotal = calculated_subtotal, discount = discount_value, tax = tax_value,
    security_deposit = calculated_deposit,
    total = greatest(calculated_subtotal - discount_value + tax_value + calculated_deposit, 0),
    balance_amount = greatest(calculated_subtotal - discount_value + tax_value + calculated_deposit, 0)
  where id = booking_key;

  delete from public.booking_items where booking_id = booking_key;

  for row_item in select * from jsonb_array_elements(payload -> 'items') loop
    variant_key := nullif(row_item ->> 'package_variant_id', '')::bigint;
    if variant_key is not null and not exists (
      select 1 from public.package_variants
      where id = variant_key and owner_id = caller
    ) then
      raise exception 'A selected rental package is unavailable';
    end if;

    insert into public.booking_items (
      owner_id, booking_id, product_id, package_id, package_variant_id,
      item_name, quantity, unit_price, security_deposit
    ) values (
      caller, booking_key,
      nullif(row_item ->> 'product_id', '')::bigint,
      nullif(row_item ->> 'package_id', '')::bigint,
      variant_key, trim(row_item ->> 'item_name'),
      (row_item ->> 'quantity')::integer,
      (row_item ->> 'unit_price')::numeric,
      greatest(coalesce((row_item ->> 'security_deposit')::numeric, 0), 0)
    );
  end loop;

  insert into public.booking_activity (owner_id, booking_id, action, details)
  values (
    caller, booking_key, 'booking_details_updated',
    jsonb_build_object('total', greatest(calculated_subtotal - discount_value + tax_value + calculated_deposit, 0))
  );
  select * into updated_booking from public.bookings where id = booking_key;
  return updated_booking;
end;
$_$;


--
-- Name: admin_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_notifications (
    id bigint NOT NULL,
    owner_id uuid NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    href text,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: admin_notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.admin_notifications ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.admin_notifications_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: booking_activity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_activity (
    id bigint NOT NULL,
    owner_id uuid NOT NULL,
    booking_id bigint NOT NULL,
    action text NOT NULL,
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: booking_activity_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.booking_activity ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.booking_activity_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: booking_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_items (
    id bigint NOT NULL,
    owner_id uuid NOT NULL,
    booking_id bigint NOT NULL,
    product_id bigint,
    package_id bigint,
    item_name text NOT NULL,
    quantity integer NOT NULL,
    unit_price numeric(12,2) NOT NULL,
    security_deposit numeric(12,2) DEFAULT 0 NOT NULL,
    line_total numeric(12,2) GENERATED ALWAYS AS (((quantity)::numeric * unit_price)) STORED,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    package_variant_id bigint,
    CONSTRAINT booking_items_check CHECK ((NOT ((product_id IS NOT NULL) AND (package_id IS NOT NULL)))),
    CONSTRAINT booking_items_item_name_check CHECK ((length(TRIM(BOTH FROM item_name)) >= 2)),
    CONSTRAINT booking_items_quantity_check CHECK ((quantity > 0)),
    CONSTRAINT booking_items_security_deposit_check CHECK ((security_deposit >= (0)::numeric)),
    CONSTRAINT booking_items_unit_price_check CHECK ((unit_price >= (0)::numeric))
);


--
-- Name: booking_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.booking_items ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.booking_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: booking_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.booking_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: booking_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_payments (
    id bigint NOT NULL,
    owner_id uuid NOT NULL,
    booking_id bigint NOT NULL,
    amount numeric(12,2) NOT NULL,
    payment_method text NOT NULL,
    reference_number text,
    notes text,
    paid_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT booking_payments_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT booking_payments_payment_method_check CHECK ((payment_method = ANY (ARRAY['cash'::text, 'card'::text, 'upi'::text, 'bank_transfer'::text, 'other'::text])))
);


--
-- Name: booking_payments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.booking_payments ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.booking_payments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: bookings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.bookings ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.bookings_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: challans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.challans (
    id bigint NOT NULL,
    owner_id uuid NOT NULL,
    challan_number text NOT NULL,
    challan_date date DEFAULT CURRENT_DATE NOT NULL,
    party_name text NOT NULL,
    mobile text,
    booking_id bigint,
    amount numeric(12,2) DEFAULT 0 NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT challans_amount_check CHECK ((amount >= (0)::numeric)),
    CONSTRAINT challans_party_name_check CHECK ((length(TRIM(BOTH FROM party_name)) >= 2)),
    CONSTRAINT challans_status_check CHECK ((status = ANY (ARRAY['active'::text, 'closed'::text])))
);


--
-- Name: challans_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.challans ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.challans_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: coupon_offers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coupon_offers (
    id bigint NOT NULL,
    owner_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    discount_type text NOT NULL,
    value numeric(12,2) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT coupon_offers_discount_type_check CHECK ((discount_type = ANY (ARRAY['percentage'::text, 'fixed'::text]))),
    CONSTRAINT coupon_offers_value_check CHECK ((value > (0)::numeric))
);


--
-- Name: coupon_offers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.coupon_offers ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.coupon_offers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customers (
    id bigint NOT NULL,
    owner_id uuid NOT NULL,
    name text NOT NULL,
    phone text NOT NULL,
    email text,
    address text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT customers_name_check CHECK ((length(TRIM(BOTH FROM name)) >= 2)),
    CONSTRAINT customers_phone_check CHECK ((length(TRIM(BOTH FROM phone)) >= 7))
);


--
-- Name: customers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.customers ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.customers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: document_number_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_number_settings (
    owner_id uuid NOT NULL,
    series text NOT NULL,
    prefix text NOT NULL,
    next_number integer DEFAULT 1 NOT NULL,
    number_padding smallint DEFAULT 4 NOT NULL,
    sequence_year integer DEFAULT (EXTRACT(year FROM CURRENT_DATE))::integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT document_number_settings_next_number_check CHECK (((next_number >= 1) AND (next_number <= 99999999))),
    CONSTRAINT document_number_settings_number_padding_check CHECK (((number_padding >= 2) AND (number_padding <= 8))),
    CONSTRAINT document_number_settings_prefix_check CHECK ((prefix ~ '^[A-Z0-9-]{2,24}-$'::text)),
    CONSTRAINT document_number_settings_sequence_year_check CHECK (((sequence_year >= 2000) AND (sequence_year <= 9999))),
    CONSTRAINT document_number_settings_series_check CHECK ((series = ANY (ARRAY['sale_booking'::text, 'rental_booking'::text, 'sale_quote'::text, 'rental_quote'::text])))
);


--
-- Name: event_job_activity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_job_activity (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_job_id text NOT NULL,
    actor text NOT NULL,
    department text NOT NULL,
    action text NOT NULL,
    details text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: event_job_collection_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_job_collection_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_job_stage_id uuid NOT NULL,
    booking_item_id bigint,
    item_name text NOT NULL,
    sent_quantity integer NOT NULL,
    returned_quantity integer NOT NULL,
    visible_damage boolean DEFAULT false NOT NULL,
    wrong_product boolean DEFAULT false NOT NULL,
    client_holding_item boolean DEFAULT false NOT NULL,
    short_quantity_flag boolean DEFAULT false NOT NULL,
    remarks text,
    evidence_photo_url text
);


--
-- Name: event_job_issues; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_job_issues (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_job_id text NOT NULL,
    stage text,
    description text NOT NULL,
    raised_by uuid,
    raised_by_name text NOT NULL,
    raised_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    resolved_by uuid
);


--
-- Name: event_job_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_job_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_job_id text NOT NULL,
    recipient_department text,
    recipient_account_id uuid,
    message text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    read_at timestamp with time zone,
    CONSTRAINT event_job_notifications_check CHECK (((recipient_department IS NULL) <> (recipient_account_id IS NULL)))
);


--
-- Name: event_job_packing_checklist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_job_packing_checklist (
    event_job_stage_id uuid NOT NULL,
    correct_quantity_packed boolean DEFAULT false NOT NULL,
    correct_boxes boolean DEFAULT false NOT NULL,
    proper_labels boolean DEFAULT false NOT NULL,
    accessories_included boolean DEFAULT false NOT NULL,
    items_secured boolean DEFAULT false NOT NULL,
    correct_event_identification boolean DEFAULT false NOT NULL,
    remarks text,
    proof_photo_url text
);


--
-- Name: event_job_pick_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_job_pick_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_job_stage_id uuid NOT NULL,
    booking_item_id bigint,
    item_name text NOT NULL,
    prepared_quantity integer,
    unavailable_quantity integer DEFAULT 0 NOT NULL,
    damaged_quantity integer DEFAULT 0 NOT NULL,
    usable_quantity integer,
    damaged_repair_quantity integer,
    missing_lost_quantity integer,
    issue_note text,
    remarks text
);


--
-- Name: event_job_qc_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_job_qc_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_job_stage_id uuid NOT NULL,
    booking_item_id bigint,
    item_name text NOT NULL,
    checked_quantity integer,
    good_quantity integer,
    damaged_quantity integer,
    repair_required_quantity integer,
    unusable_quantity integer,
    issue_type text,
    remarks text,
    evidence_photo_url text
);


--
-- Name: event_job_stages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_job_stages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_job_id text NOT NULL,
    stage text NOT NULL,
    status text DEFAULT 'not_started'::text NOT NULL,
    assigned_staff_id bigint,
    opened_at timestamp with time zone,
    completed_at timestamp with time zone,
    completed_by uuid,
    notes jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT event_job_stages_stage_check CHECK ((stage = ANY (ARRAY['warehouse_pick'::text, 'quality_check'::text, 'packing'::text, 'stylist_opportunity'::text, 'collection'::text, 'return_quality_check'::text, 'return_warehouse'::text, 'booking_final_check'::text]))),
    CONSTRAINT event_job_stages_status_check CHECK ((status = ANY (ARRAY['not_started'::text, 'open'::text, 'in_progress'::text, 'done'::text, 'blocked'::text])))
);


--
-- Name: event_job_stylist_execution; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_job_stylist_execution (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_job_stylist_interest_id uuid NOT NULL,
    action text NOT NULL,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT event_job_stylist_execution_action_check CHECK ((action = ANY (ARRAY['reached_venue'::text, 'start_work'::text, 'complete_work'::text])))
);


--
-- Name: event_job_stylist_interest; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_job_stylist_interest (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_job_id text NOT NULL,
    staff_id bigint NOT NULL,
    status text DEFAULT 'interested'::text NOT NULL,
    expressed_at timestamp with time zone DEFAULT now() NOT NULL,
    decided_at timestamp with time zone,
    decided_by uuid,
    CONSTRAINT event_job_stylist_interest_status_check CHECK ((status = ANY (ARRAY['interested'::text, 'approved'::text, 'rejected'::text, 'backup'::text])))
);


--
-- Name: event_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_jobs (
    id text NOT NULL,
    booking_id bigint NOT NULL,
    owner_id uuid NOT NULL,
    job_number text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    stylists_required_count integer DEFAULT 1 NOT NULL,
    payment_summary jsonb,
    booking_final_check jsonb,
    performance_credited boolean DEFAULT false NOT NULL,
    state jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    closed_at timestamp with time zone,
    closed_by uuid,
    CONSTRAINT event_jobs_status_check CHECK ((status = ANY (ARRAY['active'::text, 'closed'::text]))),
    CONSTRAINT event_jobs_stylists_required_count_check CHECK ((stylists_required_count >= 0))
);


--
-- Name: expenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expenses (
    id bigint NOT NULL,
    owner_id uuid NOT NULL,
    amount numeric(12,2) NOT NULL,
    expense_date date DEFAULT CURRENT_DATE NOT NULL,
    category text DEFAULT 'Uncategorized'::text NOT NULL,
    vendor_id bigint,
    booking_id bigint,
    receipt_number text,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT expenses_amount_check CHECK ((amount > (0)::numeric))
);


--
-- Name: expenses_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.expenses ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.expenses_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: hr_attendance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hr_attendance (
    id bigint NOT NULL,
    owner_id uuid NOT NULL,
    staff_id bigint NOT NULL,
    attendance_date date DEFAULT CURRENT_DATE NOT NULL,
    status text DEFAULT 'present'::text NOT NULL,
    check_in timestamp with time zone,
    check_out timestamp with time zone,
    notes text,
    working_hours numeric(5,2) DEFAULT 0 NOT NULL,
    overtime numeric(5,2) DEFAULT 0 NOT NULL,
    CONSTRAINT hr_attendance_overtime_check CHECK ((overtime >= (0)::numeric)),
    CONSTRAINT hr_attendance_status_check CHECK ((status = ANY (ARRAY['present'::text, 'late'::text, 'absent'::text, 'half_day'::text, 'on_leave'::text]))),
    CONSTRAINT hr_attendance_working_hours_check CHECK ((working_hours >= (0)::numeric))
);


--
-- Name: hr_attendance_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.hr_attendance ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.hr_attendance_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: hr_kyc_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hr_kyc_documents (
    id bigint NOT NULL,
    owner_id uuid NOT NULL,
    staff_id bigint NOT NULL,
    document_type text NOT NULL,
    document_number text,
    status text DEFAULT 'pending'::text NOT NULL,
    document_url text,
    address_proof text,
    bank_details_status text DEFAULT 'pending'::text NOT NULL,
    admin_notes text,
    verified_by uuid,
    verified_at timestamp with time zone,
    CONSTRAINT hr_kyc_documents_bank_details_status_check CHECK ((bank_details_status = ANY (ARRAY['pending'::text, 'verified'::text, 'not_provided'::text]))),
    CONSTRAINT hr_kyc_documents_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'verified'::text, 'rejected'::text])))
);


--
-- Name: hr_kyc_documents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.hr_kyc_documents ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.hr_kyc_documents_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: hr_letters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hr_letters (
    id bigint NOT NULL,
    owner_id uuid NOT NULL,
    staff_id bigint NOT NULL,
    letter_type text NOT NULL,
    title text NOT NULL,
    issued_on date DEFAULT CURRENT_DATE NOT NULL,
    notes text
);


--
-- Name: hr_letters_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.hr_letters ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.hr_letters_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: hr_payroll; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hr_payroll (
    id bigint NOT NULL,
    owner_id uuid NOT NULL,
    staff_id bigint NOT NULL,
    period date NOT NULL,
    base_salary numeric(12,2) DEFAULT 0 NOT NULL,
    allowances numeric(12,2) DEFAULT 0 NOT NULL,
    deductions numeric(12,2) DEFAULT 0 NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    advances numeric(12,2) DEFAULT 0 NOT NULL,
    net_salary numeric(12,2) GENERATED ALWAYS AS ((((base_salary + allowances) - deductions) - advances)) STORED,
    CONSTRAINT hr_payroll_advances_check CHECK ((advances >= (0)::numeric)),
    CONSTRAINT hr_payroll_allowances_check CHECK ((allowances >= (0)::numeric)),
    CONSTRAINT hr_payroll_base_salary_check CHECK ((base_salary >= (0)::numeric)),
    CONSTRAINT hr_payroll_deductions_check CHECK ((deductions >= (0)::numeric)),
    CONSTRAINT hr_payroll_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processed'::text, 'paid'::text])))
);


--
-- Name: hr_payroll_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.hr_payroll ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.hr_payroll_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: hr_work_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hr_work_orders (
    id bigint NOT NULL,
    owner_id uuid NOT NULL,
    title text NOT NULL,
    department text NOT NULL,
    assigned_staff_id bigint,
    status text DEFAULT 'open'::text NOT NULL,
    due_date date,
    notes text,
    CONSTRAINT hr_work_orders_status_check CHECK ((status = ANY (ARRAY['open'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text])))
);


--
-- Name: hr_work_orders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.hr_work_orders ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.hr_work_orders_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: laundry_batch_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.laundry_batch_items (
    id bigint NOT NULL,
    batch_id bigint NOT NULL,
    product_id bigint,
    product_name text NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    condition_before text DEFAULT 'dirty'::text NOT NULL,
    condition_after text,
    unit_cost numeric(12,2) DEFAULT 0 NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT laundry_batch_items_quantity_check CHECK ((quantity > 0)),
    CONSTRAINT laundry_batch_items_unit_cost_check CHECK ((unit_cost >= (0)::numeric))
);


--
-- Name: laundry_batch_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.laundry_batch_items ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.laundry_batch_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: laundry_batch_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.laundry_batch_notes (
    id bigint NOT NULL,
    batch_id bigint NOT NULL,
    owner_id uuid NOT NULL,
    note text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: laundry_batch_notes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.laundry_batch_notes ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.laundry_batch_notes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: laundry_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.laundry_batches (
    id bigint NOT NULL,
    owner_id uuid NOT NULL,
    batch_number text NOT NULL,
    vendor_id bigint NOT NULL,
    status text DEFAULT 'in_progress'::text NOT NULL,
    sent_date date DEFAULT CURRENT_DATE NOT NULL,
    expected_return_date date NOT NULL,
    total_cost numeric(12,2) DEFAULT 0 NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT laundry_batches_status_check CHECK ((status = ANY (ARRAY['in_progress'::text, 'returned'::text, 'cancelled'::text]))),
    CONSTRAINT laundry_batches_total_cost_check CHECK ((total_cost >= (0)::numeric))
);


--
-- Name: laundry_batches_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.laundry_batches ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.laundry_batches_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: lead_locked_dates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_locked_dates (
    id bigint NOT NULL,
    owner_id uuid NOT NULL,
    locked_date date NOT NULL,
    label text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: lead_locked_dates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.lead_locked_dates ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.lead_locked_dates_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leads (
    id bigint NOT NULL,
    owner_id uuid NOT NULL,
    full_name text NOT NULL,
    phone text NOT NULL,
    email text,
    event_date date NOT NULL,
    location text,
    package_interest text,
    source text DEFAULT 'Manual Entry'::text NOT NULL,
    status text DEFAULT 'new'::text NOT NULL,
    assigned_staff_id bigint,
    requirements text,
    internal_notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT leads_full_name_check CHECK ((length(TRIM(BOTH FROM full_name)) >= 2)),
    CONSTRAINT leads_status_check CHECK ((status = ANY (ARRAY['new'::text, 'contacted'::text, 'interested'::text, 'converted'::text, 'lost'::text])))
);


--
-- Name: leads_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.leads ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.leads_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: package_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.package_categories (
    id bigint NOT NULL,
    owner_id uuid NOT NULL,
    name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT package_categories_name_check CHECK ((length(TRIM(BOTH FROM name)) >= 1))
);


--
-- Name: package_categories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.package_categories ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.package_categories_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: package_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.package_items (
    id bigint NOT NULL,
    owner_id uuid NOT NULL,
    package_id bigint NOT NULL,
    product_id bigint NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    CONSTRAINT package_items_quantity_check CHECK ((quantity > 0))
);


--
-- Name: package_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.package_items ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.package_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: package_variants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.package_variants (
    id bigint NOT NULL,
    owner_id uuid NOT NULL,
    category_id bigint NOT NULL,
    safa_quantity integer,
    package_number integer,
    name text NOT NULL,
    description text,
    base_price numeric(12,2) DEFAULT 0 NOT NULL,
    inclusions text[] DEFAULT '{}'::text[] NOT NULL,
    extra_safa_price numeric(12,2) DEFAULT 0 NOT NULL,
    missing_safa_penalty numeric(12,2) DEFAULT 0 NOT NULL,
    security_deposit numeric(12,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    image_url text,
    CONSTRAINT package_variants_base_price_check CHECK ((base_price >= (0)::numeric)),
    CONSTRAINT package_variants_extra_safa_price_check CHECK ((extra_safa_price >= (0)::numeric)),
    CONSTRAINT package_variants_missing_safa_penalty_check CHECK ((missing_safa_penalty >= (0)::numeric)),
    CONSTRAINT package_variants_name_check CHECK ((length(TRIM(BOTH FROM name)) >= 1)),
    CONSTRAINT package_variants_package_number_check CHECK (((package_number IS NULL) OR (package_number > 0))),
    CONSTRAINT package_variants_safa_quantity_check CHECK (((safa_quantity IS NULL) OR (safa_quantity > 0))),
    CONSTRAINT package_variants_security_deposit_check CHECK ((security_deposit >= (0)::numeric))
);


--
-- Name: package_variants_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.package_variants ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.package_variants_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: packages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.packages (
    id bigint NOT NULL,
    owner_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    sale_price numeric(12,2) DEFAULT 0 NOT NULL,
    rental_price numeric(12,2) DEFAULT 0 NOT NULL,
    security_deposit numeric(12,2) DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT packages_name_check CHECK ((length(TRIM(BOTH FROM name)) >= 2)),
    CONSTRAINT packages_rental_price_check CHECK ((rental_price >= (0)::numeric)),
    CONSTRAINT packages_sale_price_check CHECK ((sale_price >= (0)::numeric)),
    CONSTRAINT packages_security_deposit_check CHECK ((security_deposit >= (0)::numeric))
);


--
-- Name: packages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.packages ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.packages_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: product_units; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_units (
    id bigint NOT NULL,
    owner_id uuid NOT NULL,
    product_id bigint NOT NULL,
    product_variant_id bigint,
    legacy_source text,
    legacy_id uuid,
    item_code text,
    barcode text NOT NULL,
    qr_code text,
    serial_number text,
    status text DEFAULT 'available'::text NOT NULL,
    condition text,
    location text,
    notes text,
    legacy_booking_id uuid,
    last_used_at timestamp with time zone,
    usage_count integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_units_barcode_check CHECK ((barcode ~ '^[A-Za-z0-9_-]{1,50}$'::text)),
    CONSTRAINT product_units_condition_check CHECK (((condition IS NULL) OR (condition = ANY (ARRAY['new'::text, 'good'::text, 'fair'::text, 'poor'::text, 'damaged'::text])))),
    CONSTRAINT product_units_legacy_source_check CHECK ((legacy_source = ANY (ARRAY['product_items'::text, 'product_barcodes'::text]))),
    CONSTRAINT product_units_status_check CHECK ((status = ANY (ARRAY['available'::text, 'booked'::text, 'in_use'::text, 'damaged'::text, 'in_laundry'::text, 'sold'::text, 'retired'::text]))),
    CONSTRAINT product_units_usage_count_check CHECK ((usage_count >= 0))
);


--
-- Name: product_units_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.product_units ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.product_units_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: product_variants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_variants (
    id bigint NOT NULL,
    owner_id uuid NOT NULL,
    product_id bigint NOT NULL,
    name text NOT NULL,
    sku text,
    barcode text,
    size text,
    color text,
    design text,
    material text,
    regular_price_adjustment numeric(12,2) DEFAULT 0 NOT NULL,
    sale_price_adjustment numeric(12,2) DEFAULT 0 NOT NULL,
    rental_price_adjustment numeric(12,2) DEFAULT 0 NOT NULL,
    stock_quantity integer DEFAULT 0 NOT NULL,
    image_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_variants_barcode_format_check CHECK (((barcode IS NULL) OR (barcode ~ '^[A-Za-z0-9_-]{1,50}$'::text))),
    CONSTRAINT product_variants_name_check CHECK ((length(TRIM(BOTH FROM name)) >= 2)),
    CONSTRAINT product_variants_stock_quantity_check CHECK ((stock_quantity >= 0))
);


--
-- Name: product_variants_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.product_variants ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.product_variants_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id bigint NOT NULL,
    owner_id uuid NOT NULL,
    sku text,
    name text NOT NULL,
    description text,
    sale_price numeric(12,2) DEFAULT 0 NOT NULL,
    rental_price numeric(12,2) DEFAULT 0 NOT NULL,
    security_deposit numeric(12,2) DEFAULT 0 NOT NULL,
    stock_quantity integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    barcode text,
    category text,
    subcategory text,
    size text,
    color text,
    material text,
    cost_price numeric(12,2) DEFAULT 0 NOT NULL,
    regular_price numeric(12,2) DEFAULT 0 NOT NULL,
    reorder_level integer DEFAULT 0 NOT NULL,
    image_urls text[] DEFAULT '{}'::text[] NOT NULL,
    CONSTRAINT products_barcode_format_check CHECK (((barcode IS NULL) OR (barcode ~ '^[A-Za-z0-9_-]{1,50}$'::text))),
    CONSTRAINT products_cost_price_check CHECK ((cost_price >= (0)::numeric)),
    CONSTRAINT products_name_check CHECK ((length(TRIM(BOTH FROM name)) >= 2)),
    CONSTRAINT products_regular_price_check CHECK ((regular_price >= (0)::numeric)),
    CONSTRAINT products_rental_price_check CHECK ((rental_price >= (0)::numeric)),
    CONSTRAINT products_reorder_level_check CHECK ((reorder_level >= 0)),
    CONSTRAINT products_sale_price_check CHECK ((sale_price >= (0)::numeric)),
    CONSTRAINT products_security_deposit_check CHECK ((security_deposit >= (0)::numeric)),
    CONSTRAINT products_stock_quantity_check CHECK ((stock_quantity >= 0))
);


--
-- Name: products_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.products ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.products_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    full_name text,
    avatar_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    role text DEFAULT 'admin'::text NOT NULL,
    CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'staff'::text])))
);


--
-- Name: quote_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.quote_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rental_returns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rental_returns (
    id bigint NOT NULL,
    owner_id uuid NOT NULL,
    booking_id bigint NOT NULL,
    condition_notes text,
    damage_charge numeric(12,2) DEFAULT 0 NOT NULL,
    late_charge numeric(12,2) DEFAULT 0 NOT NULL,
    refund_amount numeric(12,2) DEFAULT 0 NOT NULL,
    returned_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT rental_returns_damage_charge_check CHECK ((damage_charge >= (0)::numeric)),
    CONSTRAINT rental_returns_late_charge_check CHECK ((late_charge >= (0)::numeric)),
    CONSTRAINT rental_returns_refund_amount_check CHECK ((refund_amount >= (0)::numeric))
);


--
-- Name: rental_returns_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.rental_returns ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.rental_returns_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: staff_access_modules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_access_modules (
    id bigint NOT NULL,
    owner_id uuid NOT NULL,
    staff_id bigint NOT NULL,
    module text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT staff_access_modules_module_check CHECK ((module = ANY (ARRAY['dashboard'::text, 'bookings'::text, 'quotations'::text, 'create_booking'::text, 'calendar'::text, 'event_jobs'::text, 'stylist_approvals'::text, 'travel'::text, 'performance'::text, 'modifications'::text, 'inventory'::text, 'packages'::text, 'customers'::text, 'ledger'::text])))
);


--
-- Name: staff_access_modules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.staff_access_modules ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.staff_access_modules_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: staff_departments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_departments (
    staff_id bigint NOT NULL,
    department text NOT NULL,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    granted_by uuid,
    CONSTRAINT staff_departments_department_check CHECK ((department = ANY (ARRAY['booking'::text, 'warehouse'::text, 'qc'::text, 'stylist'::text, 'collection'::text, 'modification'::text])))
);


--
-- Name: staff_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_members (
    id bigint NOT NULL,
    owner_id uuid NOT NULL,
    name text NOT NULL,
    phone text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid,
    login_id text,
    portal_active boolean DEFAULT false NOT NULL,
    access_type text DEFAULT 'staff'::text NOT NULL,
    email text,
    address text,
    staff_type text DEFAULT 'regular'::text NOT NULL,
    CONSTRAINT staff_members_access_type_check CHECK ((access_type = ANY (ARRAY['main'::text, 'staff'::text]))),
    CONSTRAINT staff_members_name_check CHECK ((length(TRIM(BOTH FROM name)) >= 2)),
    CONSTRAINT staff_members_staff_type_check CHECK ((staff_type = ANY (ARRAY['regular'::text, 'stylist'::text])))
);


--
-- Name: staff_members_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.staff_members ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.staff_members_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: staff_performance_credits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_performance_credits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    staff_id bigint,
    identifier text NOT NULL,
    name text NOT NULL,
    event_job_id text NOT NULL,
    department text NOT NULL,
    credited_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: stylist_travel_bookings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stylist_travel_bookings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_job_stylist_interest_id uuid NOT NULL,
    leg_type text NOT NULL,
    mode text,
    from_location text,
    to_location text,
    departure_at timestamp with time zone,
    arrival_at timestamp with time zone,
    ticket_reference text,
    ticket_file_url text,
    pickup_details text,
    accommodation_hotel text,
    accommodation_check_in date,
    accommodation_check_out date,
    accommodation_room_details text,
    cost numeric(12,2) DEFAULT 0 NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT stylist_travel_bookings_leg_type_check CHECK ((leg_type = ANY (ARRAY['onward'::text, 'return'::text])))
);


--
-- Name: vendors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendors (
    id bigint NOT NULL,
    owner_id uuid NOT NULL,
    name text NOT NULL,
    contact_person text,
    phone text NOT NULL,
    email text,
    address text,
    notes text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vendors_name_check CHECK ((length(TRIM(BOTH FROM name)) >= 2))
);


--
-- Name: vendors_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.vendors ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.vendors_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: vouchers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vouchers (
    id bigint NOT NULL,
    owner_id uuid NOT NULL,
    voucher_number text NOT NULL,
    voucher_type text NOT NULL,
    voucher_date date DEFAULT CURRENT_DATE NOT NULL,
    payment_mode text DEFAULT 'cash'::text NOT NULL,
    amount numeric(12,2) NOT NULL,
    booking_id bigint,
    account_name text NOT NULL,
    narration text,
    receiver_name text,
    prepared_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vouchers_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT vouchers_voucher_type_check CHECK ((voucher_type = ANY (ARRAY['payment'::text, 'receipt'::text])))
);


--
-- Name: vouchers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.vouchers ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.vouchers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: admin_notifications admin_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_notifications
    ADD CONSTRAINT admin_notifications_pkey PRIMARY KEY (id);


--
-- Name: booking_activity booking_activity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_activity
    ADD CONSTRAINT booking_activity_pkey PRIMARY KEY (id);


--
-- Name: booking_items booking_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_items
    ADD CONSTRAINT booking_items_pkey PRIMARY KEY (id);


--
-- Name: booking_payments booking_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_payments
    ADD CONSTRAINT booking_payments_pkey PRIMARY KEY (id);


--
-- Name: bookings bookings_booking_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_booking_number_key UNIQUE (booking_number);


--
-- Name: bookings bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_pkey PRIMARY KEY (id);


--
-- Name: challans challans_owner_id_challan_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.challans
    ADD CONSTRAINT challans_owner_id_challan_number_key UNIQUE (owner_id, challan_number);


--
-- Name: challans challans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.challans
    ADD CONSTRAINT challans_pkey PRIMARY KEY (id);


--
-- Name: coupon_offers coupon_offers_owner_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupon_offers
    ADD CONSTRAINT coupon_offers_owner_id_code_key UNIQUE (owner_id, code);


--
-- Name: coupon_offers coupon_offers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupon_offers
    ADD CONSTRAINT coupon_offers_pkey PRIMARY KEY (id);


--
-- Name: customers customers_owner_id_phone_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_owner_id_phone_key UNIQUE (owner_id, phone);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: document_number_settings document_number_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_number_settings
    ADD CONSTRAINT document_number_settings_pkey PRIMARY KEY (owner_id, series);


--
-- Name: event_job_activity event_job_activity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_job_activity
    ADD CONSTRAINT event_job_activity_pkey PRIMARY KEY (id);


--
-- Name: event_job_collection_items event_job_collection_items_event_job_stage_id_item_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_job_collection_items
    ADD CONSTRAINT event_job_collection_items_event_job_stage_id_item_name_key UNIQUE (event_job_stage_id, item_name);


--
-- Name: event_job_collection_items event_job_collection_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_job_collection_items
    ADD CONSTRAINT event_job_collection_items_pkey PRIMARY KEY (id);


--
-- Name: event_job_issues event_job_issues_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_job_issues
    ADD CONSTRAINT event_job_issues_pkey PRIMARY KEY (id);


--
-- Name: event_job_notifications event_job_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_job_notifications
    ADD CONSTRAINT event_job_notifications_pkey PRIMARY KEY (id);


--
-- Name: event_job_packing_checklist event_job_packing_checklist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_job_packing_checklist
    ADD CONSTRAINT event_job_packing_checklist_pkey PRIMARY KEY (event_job_stage_id);


--
-- Name: event_job_pick_items event_job_pick_items_event_job_stage_id_item_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_job_pick_items
    ADD CONSTRAINT event_job_pick_items_event_job_stage_id_item_name_key UNIQUE (event_job_stage_id, item_name);


--
-- Name: event_job_pick_items event_job_pick_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_job_pick_items
    ADD CONSTRAINT event_job_pick_items_pkey PRIMARY KEY (id);


--
-- Name: event_job_qc_items event_job_qc_items_event_job_stage_id_item_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_job_qc_items
    ADD CONSTRAINT event_job_qc_items_event_job_stage_id_item_name_key UNIQUE (event_job_stage_id, item_name);


--
-- Name: event_job_qc_items event_job_qc_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_job_qc_items
    ADD CONSTRAINT event_job_qc_items_pkey PRIMARY KEY (id);


--
-- Name: event_job_stages event_job_stages_event_job_id_stage_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_job_stages
    ADD CONSTRAINT event_job_stages_event_job_id_stage_key UNIQUE (event_job_id, stage);


--
-- Name: event_job_stages event_job_stages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_job_stages
    ADD CONSTRAINT event_job_stages_pkey PRIMARY KEY (id);


--
-- Name: event_job_stylist_execution event_job_stylist_execution_event_job_stylist_interest_id_a_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_job_stylist_execution
    ADD CONSTRAINT event_job_stylist_execution_event_job_stylist_interest_id_a_key UNIQUE (event_job_stylist_interest_id, action);


--
-- Name: event_job_stylist_execution event_job_stylist_execution_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_job_stylist_execution
    ADD CONSTRAINT event_job_stylist_execution_pkey PRIMARY KEY (id);


--
-- Name: event_job_stylist_interest event_job_stylist_interest_event_job_id_staff_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_job_stylist_interest
    ADD CONSTRAINT event_job_stylist_interest_event_job_id_staff_id_key UNIQUE (event_job_id, staff_id);


--
-- Name: event_job_stylist_interest event_job_stylist_interest_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_job_stylist_interest
    ADD CONSTRAINT event_job_stylist_interest_pkey PRIMARY KEY (id);


--
-- Name: event_jobs event_jobs_booking_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_jobs
    ADD CONSTRAINT event_jobs_booking_id_key UNIQUE (booking_id);


--
-- Name: event_jobs event_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_jobs
    ADD CONSTRAINT event_jobs_pkey PRIMARY KEY (id);


--
-- Name: expenses expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);


--
-- Name: hr_attendance hr_attendance_owner_id_staff_id_attendance_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_attendance
    ADD CONSTRAINT hr_attendance_owner_id_staff_id_attendance_date_key UNIQUE (owner_id, staff_id, attendance_date);


--
-- Name: hr_attendance hr_attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_attendance
    ADD CONSTRAINT hr_attendance_pkey PRIMARY KEY (id);


--
-- Name: hr_kyc_documents hr_kyc_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_kyc_documents
    ADD CONSTRAINT hr_kyc_documents_pkey PRIMARY KEY (id);


--
-- Name: hr_letters hr_letters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_letters
    ADD CONSTRAINT hr_letters_pkey PRIMARY KEY (id);


--
-- Name: hr_payroll hr_payroll_owner_id_staff_id_period_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_payroll
    ADD CONSTRAINT hr_payroll_owner_id_staff_id_period_key UNIQUE (owner_id, staff_id, period);


--
-- Name: hr_payroll hr_payroll_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_payroll
    ADD CONSTRAINT hr_payroll_pkey PRIMARY KEY (id);


--
-- Name: hr_work_orders hr_work_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_work_orders
    ADD CONSTRAINT hr_work_orders_pkey PRIMARY KEY (id);


--
-- Name: laundry_batch_items laundry_batch_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.laundry_batch_items
    ADD CONSTRAINT laundry_batch_items_pkey PRIMARY KEY (id);


--
-- Name: laundry_batch_notes laundry_batch_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.laundry_batch_notes
    ADD CONSTRAINT laundry_batch_notes_pkey PRIMARY KEY (id);


--
-- Name: laundry_batches laundry_batches_owner_id_batch_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.laundry_batches
    ADD CONSTRAINT laundry_batches_owner_id_batch_number_key UNIQUE (owner_id, batch_number);


--
-- Name: laundry_batches laundry_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.laundry_batches
    ADD CONSTRAINT laundry_batches_pkey PRIMARY KEY (id);


--
-- Name: lead_locked_dates lead_locked_dates_owner_id_locked_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_locked_dates
    ADD CONSTRAINT lead_locked_dates_owner_id_locked_date_key UNIQUE (owner_id, locked_date);


--
-- Name: lead_locked_dates lead_locked_dates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_locked_dates
    ADD CONSTRAINT lead_locked_dates_pkey PRIMARY KEY (id);


--
-- Name: leads leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_pkey PRIMARY KEY (id);


--
-- Name: package_categories package_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.package_categories
    ADD CONSTRAINT package_categories_pkey PRIMARY KEY (id);


--
-- Name: package_items package_items_package_id_product_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.package_items
    ADD CONSTRAINT package_items_package_id_product_id_key UNIQUE (package_id, product_id);


--
-- Name: package_items package_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.package_items
    ADD CONSTRAINT package_items_pkey PRIMARY KEY (id);


--
-- Name: package_variants package_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.package_variants
    ADD CONSTRAINT package_variants_pkey PRIMARY KEY (id);


--
-- Name: packages packages_owner_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.packages
    ADD CONSTRAINT packages_owner_id_name_key UNIQUE (owner_id, name);


--
-- Name: packages packages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.packages
    ADD CONSTRAINT packages_pkey PRIMARY KEY (id);


--
-- Name: product_units product_units_owner_id_barcode_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_units
    ADD CONSTRAINT product_units_owner_id_barcode_key UNIQUE (owner_id, barcode);


--
-- Name: product_units product_units_owner_id_legacy_source_legacy_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_units
    ADD CONSTRAINT product_units_owner_id_legacy_source_legacy_id_key UNIQUE (owner_id, legacy_source, legacy_id);


--
-- Name: product_units product_units_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_units
    ADD CONSTRAINT product_units_pkey PRIMARY KEY (id);


--
-- Name: product_variants product_variants_owner_id_sku_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variants
    ADD CONSTRAINT product_variants_owner_id_sku_key UNIQUE (owner_id, sku);


--
-- Name: product_variants product_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variants
    ADD CONSTRAINT product_variants_pkey PRIMARY KEY (id);


--
-- Name: products products_owner_id_sku_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_owner_id_sku_key UNIQUE (owner_id, sku);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: rental_returns rental_returns_booking_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rental_returns
    ADD CONSTRAINT rental_returns_booking_id_key UNIQUE (booking_id);


--
-- Name: rental_returns rental_returns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rental_returns
    ADD CONSTRAINT rental_returns_pkey PRIMARY KEY (id);


--
-- Name: staff_access_modules staff_access_modules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_access_modules
    ADD CONSTRAINT staff_access_modules_pkey PRIMARY KEY (id);


--
-- Name: staff_access_modules staff_access_modules_staff_id_module_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_access_modules
    ADD CONSTRAINT staff_access_modules_staff_id_module_key UNIQUE (staff_id, module);


--
-- Name: staff_departments staff_departments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_departments
    ADD CONSTRAINT staff_departments_pkey PRIMARY KEY (staff_id, department);


--
-- Name: staff_members staff_members_owner_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_members
    ADD CONSTRAINT staff_members_owner_id_name_key UNIQUE (owner_id, name);


--
-- Name: staff_members staff_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_members
    ADD CONSTRAINT staff_members_pkey PRIMARY KEY (id);


--
-- Name: staff_performance_credits staff_performance_credits_identifier_event_job_id_departmen_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_performance_credits
    ADD CONSTRAINT staff_performance_credits_identifier_event_job_id_departmen_key UNIQUE (identifier, event_job_id, department);


--
-- Name: staff_performance_credits staff_performance_credits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_performance_credits
    ADD CONSTRAINT staff_performance_credits_pkey PRIMARY KEY (id);


--
-- Name: stylist_travel_bookings stylist_travel_bookings_event_job_stylist_interest_id_leg_t_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stylist_travel_bookings
    ADD CONSTRAINT stylist_travel_bookings_event_job_stylist_interest_id_leg_t_key UNIQUE (event_job_stylist_interest_id, leg_type);


--
-- Name: stylist_travel_bookings stylist_travel_bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stylist_travel_bookings
    ADD CONSTRAINT stylist_travel_bookings_pkey PRIMARY KEY (id);


--
-- Name: vendors vendors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT vendors_pkey PRIMARY KEY (id);


--
-- Name: vouchers vouchers_owner_id_voucher_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vouchers
    ADD CONSTRAINT vouchers_owner_id_voucher_number_key UNIQUE (owner_id, voucher_number);


--
-- Name: vouchers vouchers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vouchers
    ADD CONSTRAINT vouchers_pkey PRIMARY KEY (id);


--
-- Name: admin_notifications_owner_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_notifications_owner_idx ON public.admin_notifications USING btree (owner_id, created_at DESC);


--
-- Name: booking_activity_booking_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX booking_activity_booking_created_idx ON public.booking_activity USING btree (booking_id, created_at DESC);


--
-- Name: booking_activity_owner_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX booking_activity_owner_id_idx ON public.booking_activity USING btree (owner_id);


--
-- Name: booking_items_booking_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX booking_items_booking_id_idx ON public.booking_items USING btree (booking_id);


--
-- Name: booking_items_owner_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX booking_items_owner_id_idx ON public.booking_items USING btree (owner_id);


--
-- Name: booking_items_package_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX booking_items_package_id_idx ON public.booking_items USING btree (package_id) WHERE (package_id IS NOT NULL);


--
-- Name: booking_items_package_variant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX booking_items_package_variant_id_idx ON public.booking_items USING btree (package_variant_id) WHERE (package_variant_id IS NOT NULL);


--
-- Name: booking_items_product_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX booking_items_product_id_idx ON public.booking_items USING btree (product_id) WHERE (product_id IS NOT NULL);


--
-- Name: booking_payments_booking_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX booking_payments_booking_id_idx ON public.booking_payments USING btree (booking_id);


--
-- Name: booking_payments_owner_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX booking_payments_owner_id_idx ON public.booking_payments USING btree (owner_id);


--
-- Name: bookings_assigned_staff_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bookings_assigned_staff_id_idx ON public.bookings USING btree (assigned_staff_id);


--
-- Name: bookings_converted_booking_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX bookings_converted_booking_unique ON public.bookings USING btree (converted_booking_id) WHERE (converted_booking_id IS NOT NULL);


--
-- Name: bookings_created_by_staff_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bookings_created_by_staff_idx ON public.bookings USING btree (owner_id, created_by_staff_id, created_at DESC);


--
-- Name: bookings_customer_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bookings_customer_id_idx ON public.bookings USING btree (customer_id);


--
-- Name: bookings_owner_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bookings_owner_created_idx ON public.bookings USING btree (owner_id, created_at DESC);


--
-- Name: bookings_owner_event_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bookings_owner_event_idx ON public.bookings USING btree (owner_id, event_date);


--
-- Name: bookings_owner_is_quote_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bookings_owner_is_quote_idx ON public.bookings USING btree (owner_id, is_quote, status);


--
-- Name: bookings_owner_quote_type_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bookings_owner_quote_type_created_idx ON public.bookings USING btree (owner_id, is_quote, booking_type, created_at DESC);


--
-- Name: bookings_owner_status_event_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bookings_owner_status_event_idx ON public.bookings USING btree (owner_id, status, event_date);


--
-- Name: bookings_source_quote_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX bookings_source_quote_unique ON public.bookings USING btree (source_quote_id) WHERE (source_quote_id IS NOT NULL);


--
-- Name: challans_owner_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX challans_owner_date_idx ON public.challans USING btree (owner_id, challan_date DESC);


--
-- Name: coupon_offers_owner_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX coupon_offers_owner_active_idx ON public.coupon_offers USING btree (owner_id, is_active, created_at DESC);


--
-- Name: customers_owner_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customers_owner_name_idx ON public.customers USING btree (owner_id, name);


--
-- Name: event_job_activity_job_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX event_job_activity_job_idx ON public.event_job_activity USING btree (event_job_id, created_at DESC);


--
-- Name: event_job_notifications_account_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX event_job_notifications_account_idx ON public.event_job_notifications USING btree (recipient_account_id, read_at);


--
-- Name: event_job_stages_job_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX event_job_stages_job_idx ON public.event_job_stages USING btree (event_job_id, stage);


--
-- Name: event_jobs_owner_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX event_jobs_owner_status_idx ON public.event_jobs USING btree (owner_id, status, created_at DESC);


--
-- Name: expenses_owner_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX expenses_owner_date_idx ON public.expenses USING btree (owner_id, expense_date DESC);


--
-- Name: hr_attendance_owner_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hr_attendance_owner_date_idx ON public.hr_attendance USING btree (owner_id, attendance_date DESC);


--
-- Name: hr_kyc_owner_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hr_kyc_owner_status_idx ON public.hr_kyc_documents USING btree (owner_id, status);


--
-- Name: hr_letters_owner_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hr_letters_owner_date_idx ON public.hr_letters USING btree (owner_id, issued_on DESC);


--
-- Name: hr_payroll_owner_period_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hr_payroll_owner_period_idx ON public.hr_payroll USING btree (owner_id, period DESC);


--
-- Name: hr_work_orders_owner_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hr_work_orders_owner_status_idx ON public.hr_work_orders USING btree (owner_id, status);


--
-- Name: laundry_batch_items_batch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX laundry_batch_items_batch_idx ON public.laundry_batch_items USING btree (batch_id);


--
-- Name: laundry_batch_notes_batch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX laundry_batch_notes_batch_idx ON public.laundry_batch_notes USING btree (batch_id, created_at DESC);


--
-- Name: laundry_batches_owner_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX laundry_batches_owner_status_idx ON public.laundry_batches USING btree (owner_id, status, sent_date DESC);


--
-- Name: leads_owner_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leads_owner_status_idx ON public.leads USING btree (owner_id, status, created_at DESC);


--
-- Name: package_categories_owner_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX package_categories_owner_active_idx ON public.package_categories USING btree (owner_id, is_active, created_at);


--
-- Name: package_categories_owner_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX package_categories_owner_name_unique ON public.package_categories USING btree (owner_id, lower(TRIM(BOTH FROM name)));


--
-- Name: package_items_owner_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX package_items_owner_id_idx ON public.package_items USING btree (owner_id);


--
-- Name: package_items_product_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX package_items_product_id_idx ON public.package_items USING btree (product_id);


--
-- Name: package_variants_category_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX package_variants_category_name_unique ON public.package_variants USING btree (category_id, lower(TRIM(BOTH FROM name)));


--
-- Name: package_variants_category_number_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX package_variants_category_number_unique ON public.package_variants USING btree (category_id, package_number) WHERE (package_number IS NOT NULL);


--
-- Name: package_variants_owner_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX package_variants_owner_category_idx ON public.package_variants USING btree (owner_id, category_id, created_at);


--
-- Name: packages_owner_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX packages_owner_active_idx ON public.packages USING btree (owner_id, is_active);


--
-- Name: product_units_owner_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_units_owner_product_idx ON public.product_units USING btree (owner_id, product_id);


--
-- Name: product_units_owner_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_units_owner_status_idx ON public.product_units USING btree (owner_id, status);


--
-- Name: product_variants_owner_barcode_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX product_variants_owner_barcode_idx ON public.product_variants USING btree (owner_id, barcode) WHERE (barcode IS NOT NULL);


--
-- Name: product_variants_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_variants_product_idx ON public.product_variants USING btree (product_id);


--
-- Name: products_owner_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX products_owner_active_idx ON public.products USING btree (owner_id, is_active);


--
-- Name: products_owner_barcode_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX products_owner_barcode_idx ON public.products USING btree (owner_id, barcode) WHERE (barcode IS NOT NULL);


--
-- Name: products_owner_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX products_owner_category_idx ON public.products USING btree (owner_id, category) WHERE (category IS NOT NULL);


--
-- Name: rental_returns_owner_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rental_returns_owner_id_idx ON public.rental_returns USING btree (owner_id);


--
-- Name: staff_access_modules_owner_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_access_modules_owner_idx ON public.staff_access_modules USING btree (owner_id, staff_id);


--
-- Name: staff_members_owner_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_members_owner_active_idx ON public.staff_members USING btree (owner_id, is_active);


--
-- Name: staff_members_owner_login_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX staff_members_owner_login_id_key ON public.staff_members USING btree (owner_id, lower(login_id)) WHERE (login_id IS NOT NULL);


--
-- Name: staff_members_owner_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_members_owner_type_idx ON public.staff_members USING btree (owner_id, staff_type, is_active) WHERE (user_id IS NOT NULL);


--
-- Name: staff_members_user_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX staff_members_user_id_key ON public.staff_members USING btree (user_id) WHERE (user_id IS NOT NULL);


--
-- Name: vendors_owner_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vendors_owner_active_idx ON public.vendors USING btree (owner_id, is_active, created_at DESC);


--
-- Name: vouchers_owner_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vouchers_owner_date_idx ON public.vouchers USING btree (owner_id, voucher_date DESC);


--
-- Name: booking_payments block_staff_payment_writes_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER block_staff_payment_writes_trigger BEFORE INSERT OR DELETE OR UPDATE ON public.booking_payments FOR EACH ROW EXECUTE FUNCTION public.block_staff_payment_writes();


--
-- Name: bookings bookings_assign_document_number; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER bookings_assign_document_number BEFORE INSERT ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.assign_booking_document_number();


--
-- Name: bookings bookings_open_event_job; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER bookings_open_event_job AFTER INSERT OR UPDATE OF status ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.booking_confirmation_opens_event_job();


--
-- Name: bookings bookings_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER bookings_set_updated_at BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: customers customers_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER customers_set_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: document_number_settings document_number_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER document_number_settings_updated_at BEFORE UPDATE ON public.document_number_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: bookings enforce_quote_only_staff_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER enforce_quote_only_staff_trigger BEFORE INSERT OR UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.enforce_quote_only_staff();


--
-- Name: event_job_stylist_interest enforce_stylist_interest_rules_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER enforce_stylist_interest_rules_trigger BEFORE INSERT OR UPDATE OF event_job_id, staff_id, status ON public.event_job_stylist_interest FOR EACH ROW EXECUTE FUNCTION public.enforce_stylist_interest_rules();


--
-- Name: staff_members keep_staff_portal_state_consistent_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER keep_staff_portal_state_consistent_trigger BEFORE INSERT OR UPDATE OF portal_active, is_active ON public.staff_members FOR EACH ROW EXECUTE FUNCTION public.keep_staff_portal_state_consistent();


--
-- Name: package_categories package_categories_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER package_categories_set_updated_at BEFORE UPDATE ON public.package_categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: package_variants package_variants_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER package_variants_set_updated_at BEFORE UPDATE ON public.package_variants FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: packages packages_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER packages_set_updated_at BEFORE UPDATE ON public.packages FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: product_units product_units_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER product_units_set_updated_at BEFORE UPDATE ON public.product_units FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: product_variants product_variants_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER product_variants_set_updated_at BEFORE UPDATE ON public.product_variants FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: products products_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER products_set_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: profiles profiles_protect_role; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profiles_protect_role BEFORE UPDATE OF role ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.protect_profile_role();


--
-- Name: staff_members staff_members_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER staff_members_set_updated_at BEFORE UPDATE ON public.staff_members FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: admin_notifications admin_notifications_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_notifications
    ADD CONSTRAINT admin_notifications_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: booking_activity booking_activity_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_activity
    ADD CONSTRAINT booking_activity_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;


--
-- Name: booking_activity booking_activity_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_activity
    ADD CONSTRAINT booking_activity_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: booking_items booking_items_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_items
    ADD CONSTRAINT booking_items_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;


--
-- Name: booking_items booking_items_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_items
    ADD CONSTRAINT booking_items_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: booking_items booking_items_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_items
    ADD CONSTRAINT booking_items_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.packages(id) ON DELETE RESTRICT;


--
-- Name: booking_items booking_items_package_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_items
    ADD CONSTRAINT booking_items_package_variant_id_fkey FOREIGN KEY (package_variant_id) REFERENCES public.package_variants(id) ON DELETE RESTRICT;


--
-- Name: booking_items booking_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_items
    ADD CONSTRAINT booking_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;


--
-- Name: booking_payments booking_payments_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_payments
    ADD CONSTRAINT booking_payments_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;


--
-- Name: booking_payments booking_payments_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_payments
    ADD CONSTRAINT booking_payments_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: bookings bookings_assigned_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_assigned_staff_id_fkey FOREIGN KEY (assigned_staff_id) REFERENCES public.staff_members(id) ON DELETE SET NULL;


--
-- Name: bookings bookings_converted_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_converted_booking_id_fkey FOREIGN KEY (converted_booking_id) REFERENCES public.bookings(id) ON DELETE SET NULL;


--
-- Name: bookings bookings_created_by_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_created_by_staff_id_fkey FOREIGN KEY (created_by_staff_id) REFERENCES public.staff_members(id) ON DELETE SET NULL;


--
-- Name: bookings bookings_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE RESTRICT;


--
-- Name: bookings bookings_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: bookings bookings_source_quote_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_source_quote_id_fkey FOREIGN KEY (source_quote_id) REFERENCES public.bookings(id) ON DELETE SET NULL;


--
-- Name: challans challans_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.challans
    ADD CONSTRAINT challans_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE SET NULL;


--
-- Name: challans challans_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.challans
    ADD CONSTRAINT challans_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: coupon_offers coupon_offers_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupon_offers
    ADD CONSTRAINT coupon_offers_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: customers customers_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: document_number_settings document_number_settings_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_number_settings
    ADD CONSTRAINT document_number_settings_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: event_job_activity event_job_activity_event_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_job_activity
    ADD CONSTRAINT event_job_activity_event_job_id_fkey FOREIGN KEY (event_job_id) REFERENCES public.event_jobs(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: event_job_collection_items event_job_collection_items_booking_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_job_collection_items
    ADD CONSTRAINT event_job_collection_items_booking_item_id_fkey FOREIGN KEY (booking_item_id) REFERENCES public.booking_items(id) ON DELETE SET NULL;


--
-- Name: event_job_collection_items event_job_collection_items_event_job_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_job_collection_items
    ADD CONSTRAINT event_job_collection_items_event_job_stage_id_fkey FOREIGN KEY (event_job_stage_id) REFERENCES public.event_job_stages(id) ON DELETE CASCADE;


--
-- Name: event_job_issues event_job_issues_event_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_job_issues
    ADD CONSTRAINT event_job_issues_event_job_id_fkey FOREIGN KEY (event_job_id) REFERENCES public.event_jobs(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: event_job_issues event_job_issues_raised_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_job_issues
    ADD CONSTRAINT event_job_issues_raised_by_fkey FOREIGN KEY (raised_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: event_job_issues event_job_issues_resolved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_job_issues
    ADD CONSTRAINT event_job_issues_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: event_job_notifications event_job_notifications_event_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_job_notifications
    ADD CONSTRAINT event_job_notifications_event_job_id_fkey FOREIGN KEY (event_job_id) REFERENCES public.event_jobs(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: event_job_notifications event_job_notifications_recipient_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_job_notifications
    ADD CONSTRAINT event_job_notifications_recipient_account_id_fkey FOREIGN KEY (recipient_account_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: event_job_packing_checklist event_job_packing_checklist_event_job_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_job_packing_checklist
    ADD CONSTRAINT event_job_packing_checklist_event_job_stage_id_fkey FOREIGN KEY (event_job_stage_id) REFERENCES public.event_job_stages(id) ON DELETE CASCADE;


--
-- Name: event_job_pick_items event_job_pick_items_booking_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_job_pick_items
    ADD CONSTRAINT event_job_pick_items_booking_item_id_fkey FOREIGN KEY (booking_item_id) REFERENCES public.booking_items(id) ON DELETE SET NULL;


--
-- Name: event_job_pick_items event_job_pick_items_event_job_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_job_pick_items
    ADD CONSTRAINT event_job_pick_items_event_job_stage_id_fkey FOREIGN KEY (event_job_stage_id) REFERENCES public.event_job_stages(id) ON DELETE CASCADE;


--
-- Name: event_job_qc_items event_job_qc_items_booking_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_job_qc_items
    ADD CONSTRAINT event_job_qc_items_booking_item_id_fkey FOREIGN KEY (booking_item_id) REFERENCES public.booking_items(id) ON DELETE SET NULL;


--
-- Name: event_job_qc_items event_job_qc_items_event_job_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_job_qc_items
    ADD CONSTRAINT event_job_qc_items_event_job_stage_id_fkey FOREIGN KEY (event_job_stage_id) REFERENCES public.event_job_stages(id) ON DELETE CASCADE;


--
-- Name: event_job_stages event_job_stages_assigned_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_job_stages
    ADD CONSTRAINT event_job_stages_assigned_staff_id_fkey FOREIGN KEY (assigned_staff_id) REFERENCES public.staff_members(id) ON DELETE SET NULL;


--
-- Name: event_job_stages event_job_stages_completed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_job_stages
    ADD CONSTRAINT event_job_stages_completed_by_fkey FOREIGN KEY (completed_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: event_job_stages event_job_stages_event_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_job_stages
    ADD CONSTRAINT event_job_stages_event_job_id_fkey FOREIGN KEY (event_job_id) REFERENCES public.event_jobs(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: event_job_stylist_execution event_job_stylist_execution_event_job_stylist_interest_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_job_stylist_execution
    ADD CONSTRAINT event_job_stylist_execution_event_job_stylist_interest_id_fkey FOREIGN KEY (event_job_stylist_interest_id) REFERENCES public.event_job_stylist_interest(id) ON DELETE CASCADE;


--
-- Name: event_job_stylist_interest event_job_stylist_interest_decided_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_job_stylist_interest
    ADD CONSTRAINT event_job_stylist_interest_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: event_job_stylist_interest event_job_stylist_interest_event_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_job_stylist_interest
    ADD CONSTRAINT event_job_stylist_interest_event_job_id_fkey FOREIGN KEY (event_job_id) REFERENCES public.event_jobs(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: event_job_stylist_interest event_job_stylist_interest_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_job_stylist_interest
    ADD CONSTRAINT event_job_stylist_interest_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff_members(id) ON DELETE CASCADE;


--
-- Name: event_jobs event_jobs_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_jobs
    ADD CONSTRAINT event_jobs_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;


--
-- Name: event_jobs event_jobs_closed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_jobs
    ADD CONSTRAINT event_jobs_closed_by_fkey FOREIGN KEY (closed_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: event_jobs event_jobs_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_jobs
    ADD CONSTRAINT event_jobs_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: expenses expenses_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE SET NULL;


--
-- Name: expenses expenses_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: expenses expenses_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON DELETE SET NULL;


--
-- Name: hr_attendance hr_attendance_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_attendance
    ADD CONSTRAINT hr_attendance_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: hr_attendance hr_attendance_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_attendance
    ADD CONSTRAINT hr_attendance_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff_members(id) ON DELETE CASCADE;


--
-- Name: hr_kyc_documents hr_kyc_documents_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_kyc_documents
    ADD CONSTRAINT hr_kyc_documents_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: hr_kyc_documents hr_kyc_documents_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_kyc_documents
    ADD CONSTRAINT hr_kyc_documents_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff_members(id) ON DELETE CASCADE;


--
-- Name: hr_kyc_documents hr_kyc_documents_verified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_kyc_documents
    ADD CONSTRAINT hr_kyc_documents_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES auth.users(id);


--
-- Name: hr_letters hr_letters_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_letters
    ADD CONSTRAINT hr_letters_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: hr_letters hr_letters_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_letters
    ADD CONSTRAINT hr_letters_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff_members(id) ON DELETE CASCADE;


--
-- Name: hr_payroll hr_payroll_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_payroll
    ADD CONSTRAINT hr_payroll_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: hr_payroll hr_payroll_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_payroll
    ADD CONSTRAINT hr_payroll_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff_members(id) ON DELETE CASCADE;


--
-- Name: hr_work_orders hr_work_orders_assigned_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_work_orders
    ADD CONSTRAINT hr_work_orders_assigned_staff_id_fkey FOREIGN KEY (assigned_staff_id) REFERENCES public.staff_members(id) ON DELETE SET NULL;


--
-- Name: hr_work_orders hr_work_orders_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_work_orders
    ADD CONSTRAINT hr_work_orders_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: laundry_batch_items laundry_batch_items_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.laundry_batch_items
    ADD CONSTRAINT laundry_batch_items_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.laundry_batches(id) ON DELETE CASCADE;


--
-- Name: laundry_batch_items laundry_batch_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.laundry_batch_items
    ADD CONSTRAINT laundry_batch_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: laundry_batch_notes laundry_batch_notes_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.laundry_batch_notes
    ADD CONSTRAINT laundry_batch_notes_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.laundry_batches(id) ON DELETE CASCADE;


--
-- Name: laundry_batch_notes laundry_batch_notes_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.laundry_batch_notes
    ADD CONSTRAINT laundry_batch_notes_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: laundry_batches laundry_batches_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.laundry_batches
    ADD CONSTRAINT laundry_batches_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: laundry_batches laundry_batches_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.laundry_batches
    ADD CONSTRAINT laundry_batches_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(id);


--
-- Name: lead_locked_dates lead_locked_dates_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_locked_dates
    ADD CONSTRAINT lead_locked_dates_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: leads leads_assigned_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_assigned_staff_id_fkey FOREIGN KEY (assigned_staff_id) REFERENCES public.staff_members(id) ON DELETE SET NULL;


--
-- Name: leads leads_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: package_categories package_categories_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.package_categories
    ADD CONSTRAINT package_categories_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: package_items package_items_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.package_items
    ADD CONSTRAINT package_items_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: package_items package_items_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.package_items
    ADD CONSTRAINT package_items_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.packages(id) ON DELETE CASCADE;


--
-- Name: package_items package_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.package_items
    ADD CONSTRAINT package_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;


--
-- Name: package_variants package_variants_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.package_variants
    ADD CONSTRAINT package_variants_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.package_categories(id) ON DELETE RESTRICT;


--
-- Name: package_variants package_variants_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.package_variants
    ADD CONSTRAINT package_variants_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: packages packages_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.packages
    ADD CONSTRAINT packages_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: product_units product_units_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_units
    ADD CONSTRAINT product_units_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: product_units product_units_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_units
    ADD CONSTRAINT product_units_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_units product_units_product_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_units
    ADD CONSTRAINT product_units_product_variant_id_fkey FOREIGN KEY (product_variant_id) REFERENCES public.product_variants(id) ON DELETE SET NULL;


--
-- Name: product_variants product_variants_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variants
    ADD CONSTRAINT product_variants_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: product_variants product_variants_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variants
    ADD CONSTRAINT product_variants_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: products products_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: rental_returns rental_returns_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rental_returns
    ADD CONSTRAINT rental_returns_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;


--
-- Name: rental_returns rental_returns_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rental_returns
    ADD CONSTRAINT rental_returns_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: staff_access_modules staff_access_modules_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_access_modules
    ADD CONSTRAINT staff_access_modules_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: staff_access_modules staff_access_modules_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_access_modules
    ADD CONSTRAINT staff_access_modules_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff_members(id) ON DELETE CASCADE;


--
-- Name: staff_departments staff_departments_granted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_departments
    ADD CONSTRAINT staff_departments_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: staff_departments staff_departments_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_departments
    ADD CONSTRAINT staff_departments_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff_members(id) ON DELETE CASCADE;


--
-- Name: staff_members staff_members_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_members
    ADD CONSTRAINT staff_members_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: staff_members staff_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_members
    ADD CONSTRAINT staff_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: staff_performance_credits staff_performance_credits_event_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_performance_credits
    ADD CONSTRAINT staff_performance_credits_event_job_id_fkey FOREIGN KEY (event_job_id) REFERENCES public.event_jobs(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: staff_performance_credits staff_performance_credits_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_performance_credits
    ADD CONSTRAINT staff_performance_credits_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff_members(id) ON DELETE CASCADE;


--
-- Name: stylist_travel_bookings stylist_travel_bookings_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stylist_travel_bookings
    ADD CONSTRAINT stylist_travel_bookings_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: stylist_travel_bookings stylist_travel_bookings_event_job_stylist_interest_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stylist_travel_bookings
    ADD CONSTRAINT stylist_travel_bookings_event_job_stylist_interest_id_fkey FOREIGN KEY (event_job_stylist_interest_id) REFERENCES public.event_job_stylist_interest(id) ON DELETE CASCADE;


--
-- Name: vendors vendors_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT vendors_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: vouchers vouchers_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vouchers
    ADD CONSTRAINT vouchers_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE SET NULL;


--
-- Name: vouchers vouchers_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vouchers
    ADD CONSTRAINT vouchers_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: document_number_settings Users can create own document number settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create own document number settings" ON public.document_number_settings FOR INSERT WITH CHECK ((( SELECT auth.uid() AS uid) = owner_id));


--
-- Name: profiles Users can read their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read their own profile" ON public.profiles FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = id));


--
-- Name: document_number_settings Users can update own document number settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own document number settings" ON public.document_number_settings FOR UPDATE USING ((( SELECT auth.uid() AS uid) = owner_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = owner_id));


--
-- Name: profiles Users can update their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = id)) WITH CHECK ((( SELECT auth.uid() AS uid) = id));


--
-- Name: document_number_settings Users can view own document number settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own document number settings" ON public.document_number_settings FOR SELECT USING ((( SELECT auth.uid() AS uid) = owner_id));


--
-- Name: admin_notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_notifications admin_notifications_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_notifications_owner ON public.admin_notifications TO authenticated USING ((owner_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((owner_id = ( SELECT auth.uid() AS uid)));


--
-- Name: booking_activity; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.booking_activity ENABLE ROW LEVEL SECURITY;

--
-- Name: booking_activity booking_activity_booking_staff_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY booking_activity_booking_staff_insert ON public.booking_activity FOR INSERT TO authenticated WITH CHECK (((owner_id = public.current_staff_owner()) AND (EXISTS ( SELECT 1
   FROM (public.bookings b
     JOIN public.staff_members sm ON ((sm.id = public.current_staff_member_id())))
  WHERE ((b.id = booking_activity.booking_id) AND (b.owner_id = booking_activity.owner_id) AND (((sm.access_type = 'staff'::text) AND b.is_quote AND (b.created_by_staff_id = sm.id) AND public.staff_can_access('quotations'::text)) OR ((sm.access_type = 'main'::text) AND ((b.is_quote AND public.staff_can_access('quotations'::text)) OR ((NOT b.is_quote) AND public.staff_can_access('bookings'::text))))))))));


--
-- Name: booking_activity booking_activity_booking_staff_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY booking_activity_booking_staff_select ON public.booking_activity FOR SELECT TO authenticated USING (((owner_id = public.current_staff_owner()) AND (EXISTS ( SELECT 1
   FROM (public.bookings b
     JOIN public.staff_members sm ON ((sm.id = public.current_staff_member_id())))
  WHERE ((b.id = booking_activity.booking_id) AND (b.owner_id = booking_activity.owner_id) AND (((sm.access_type = 'staff'::text) AND b.is_quote AND (b.created_by_staff_id = sm.id) AND public.staff_can_access('quotations'::text)) OR ((sm.access_type = 'main'::text) AND ((b.is_quote AND public.staff_can_access('quotations'::text)) OR ((NOT b.is_quote) AND public.staff_can_access('bookings'::text))))))))));


--
-- Name: booking_activity booking_activity_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY booking_activity_insert_own ON public.booking_activity FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = owner_id));


--
-- Name: booking_activity booking_activity_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY booking_activity_select_own ON public.booking_activity FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = owner_id));


--
-- Name: booking_activity booking_activity_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY booking_activity_update_own ON public.booking_activity FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = owner_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = owner_id));


--
-- Name: booking_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.booking_items ENABLE ROW LEVEL SECURITY;

--
-- Name: booking_items booking_items_booking_staff_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY booking_items_booking_staff_delete ON public.booking_items FOR DELETE TO authenticated USING (((owner_id = public.current_staff_owner()) AND (EXISTS ( SELECT 1
   FROM public.bookings b
  WHERE ((b.id = booking_items.booking_id) AND ((b.is_quote AND public.staff_can_access('quotations'::text)) OR ((NOT b.is_quote) AND public.staff_can_access('bookings'::text))))))));


--
-- Name: booking_items booking_items_booking_staff_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY booking_items_booking_staff_insert ON public.booking_items FOR INSERT TO authenticated WITH CHECK (((owner_id = public.current_staff_owner()) AND (EXISTS ( SELECT 1
   FROM public.bookings b
  WHERE ((b.id = booking_items.booking_id) AND ((b.is_quote AND public.staff_can_access('quotations'::text)) OR ((NOT b.is_quote) AND public.staff_can_access('bookings'::text))))))));


--
-- Name: booking_items booking_items_booking_staff_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY booking_items_booking_staff_update ON public.booking_items FOR UPDATE TO authenticated USING (((owner_id = public.current_staff_owner()) AND (EXISTS ( SELECT 1
   FROM public.bookings b
  WHERE ((b.id = booking_items.booking_id) AND ((b.is_quote AND public.staff_can_access('quotations'::text)) OR ((NOT b.is_quote) AND public.staff_can_access('bookings'::text)))))))) WITH CHECK ((owner_id = public.current_staff_owner()));


--
-- Name: booking_items booking_items_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY booking_items_delete_own ON public.booking_items FOR DELETE TO authenticated USING ((( SELECT auth.uid() AS uid) = owner_id));


--
-- Name: booking_items booking_items_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY booking_items_insert_own ON public.booking_items FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = owner_id));


--
-- Name: booking_items booking_items_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY booking_items_select_own ON public.booking_items FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = owner_id));


--
-- Name: booking_items booking_items_staff_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY booking_items_staff_select ON public.booking_items FOR SELECT TO authenticated USING (((owner_id = public.current_staff_owner()) AND (EXISTS ( SELECT 1
   FROM public.bookings b
  WHERE ((b.id = booking_items.booking_id) AND ((b.is_quote AND public.staff_can_access('quotations'::text)) OR ((NOT b.is_quote) AND public.staff_can_access('bookings'::text))))))));


--
-- Name: booking_items booking_items_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY booking_items_update_own ON public.booking_items FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = owner_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = owner_id));


--
-- Name: booking_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.booking_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: booking_payments booking_payments_booking_staff_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY booking_payments_booking_staff_insert ON public.booking_payments FOR INSERT TO authenticated WITH CHECK (((owner_id = public.current_staff_owner()) AND public.staff_can_access('bookings'::text)));


--
-- Name: booking_payments booking_payments_booking_staff_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY booking_payments_booking_staff_select ON public.booking_payments FOR SELECT TO authenticated USING (((owner_id = public.current_staff_owner()) AND public.staff_can_access('bookings'::text)));


--
-- Name: booking_payments booking_payments_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY booking_payments_insert_own ON public.booking_payments FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = owner_id));


--
-- Name: booking_payments booking_payments_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY booking_payments_select_own ON public.booking_payments FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = owner_id));


--
-- Name: booking_payments booking_payments_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY booking_payments_update_own ON public.booking_payments FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = owner_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = owner_id));


--
-- Name: bookings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

--
-- Name: bookings bookings_booking_staff_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bookings_booking_staff_insert ON public.bookings FOR INSERT TO authenticated WITH CHECK (((owner_id = public.current_staff_owner()) AND (EXISTS ( SELECT 1
   FROM public.staff_members sm
  WHERE ((sm.id = public.current_staff_member_id()) AND (((sm.access_type = 'staff'::text) AND bookings.is_quote AND (bookings.created_by_staff_id = sm.id) AND (bookings.assigned_staff_id = sm.id)) OR ((sm.access_type = 'main'::text) AND ((bookings.is_quote AND public.staff_can_access('quotations'::text)) OR ((NOT bookings.is_quote) AND public.staff_can_access('bookings'::text))))))))));


--
-- Name: bookings bookings_booking_staff_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bookings_booking_staff_update ON public.bookings FOR UPDATE TO authenticated USING (((owner_id = public.current_staff_owner()) AND (EXISTS ( SELECT 1
   FROM public.staff_members sm
  WHERE ((sm.id = public.current_staff_member_id()) AND (((sm.access_type = 'staff'::text) AND bookings.is_quote AND (bookings.created_by_staff_id = sm.id)) OR ((sm.access_type = 'main'::text) AND ((bookings.is_quote AND public.staff_can_access('quotations'::text)) OR ((NOT bookings.is_quote) AND public.staff_can_access('bookings'::text)))))))))) WITH CHECK (((owner_id = public.current_staff_owner()) AND (EXISTS ( SELECT 1
   FROM public.staff_members sm
  WHERE ((sm.id = public.current_staff_member_id()) AND (((sm.access_type = 'staff'::text) AND bookings.is_quote AND (bookings.created_by_staff_id = sm.id)) OR ((sm.access_type = 'main'::text) AND ((bookings.is_quote AND public.staff_can_access('quotations'::text)) OR ((NOT bookings.is_quote) AND public.staff_can_access('bookings'::text))))))))));


--
-- Name: bookings bookings_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bookings_insert_own ON public.bookings FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = owner_id));


--
-- Name: bookings bookings_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bookings_select_own ON public.bookings FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = owner_id));


--
-- Name: bookings bookings_staff_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bookings_staff_select ON public.bookings FOR SELECT TO authenticated USING (((owner_id = public.current_staff_owner()) AND (EXISTS ( SELECT 1
   FROM public.staff_members sm
  WHERE ((sm.id = public.current_staff_member_id()) AND (((sm.access_type = 'staff'::text) AND bookings.is_quote AND (bookings.created_by_staff_id = sm.id)) OR ((sm.access_type = 'main'::text) AND ((bookings.is_quote AND public.staff_can_access('quotations'::text)) OR ((NOT bookings.is_quote) AND public.staff_can_access('bookings'::text))))))))));


--
-- Name: bookings bookings_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bookings_update_own ON public.bookings FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = owner_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = owner_id));


--
-- Name: challans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.challans ENABLE ROW LEVEL SECURITY;

--
-- Name: challans challans_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY challans_owner ON public.challans TO authenticated USING ((owner_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((owner_id = ( SELECT auth.uid() AS uid)));


--
-- Name: coupon_offers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.coupon_offers ENABLE ROW LEVEL SECURITY;

--
-- Name: coupon_offers coupon_offers_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY coupon_offers_owner ON public.coupon_offers TO authenticated USING ((owner_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((owner_id = ( SELECT auth.uid() AS uid)));


--
-- Name: customers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

--
-- Name: customers customers_booking_staff_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customers_booking_staff_insert ON public.customers FOR INSERT TO authenticated WITH CHECK (((owner_id = public.current_staff_owner()) AND public.staff_can_access_any(ARRAY['customers'::text, 'quotations'::text, 'bookings'::text, 'create_booking'::text])));


--
-- Name: customers customers_booking_staff_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customers_booking_staff_update ON public.customers FOR UPDATE TO authenticated USING (((owner_id = public.current_staff_owner()) AND public.staff_can_access_any(ARRAY['customers'::text, 'quotations'::text, 'bookings'::text, 'create_booking'::text]))) WITH CHECK (((owner_id = public.current_staff_owner()) AND public.staff_can_access_any(ARRAY['customers'::text, 'quotations'::text, 'bookings'::text, 'create_booking'::text])));


--
-- Name: customers customers_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customers_insert_own ON public.customers FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = owner_id));


--
-- Name: customers customers_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customers_select_own ON public.customers FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = owner_id));


--
-- Name: customers customers_staff_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customers_staff_select ON public.customers FOR SELECT TO authenticated USING (((owner_id = public.current_staff_owner()) AND public.staff_can_access_any(ARRAY['customers'::text, 'quotations'::text, 'bookings'::text, 'create_booking'::text])));


--
-- Name: customers customers_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customers_update_own ON public.customers FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = owner_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = owner_id));


--
-- Name: document_number_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.document_number_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: event_job_activity; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_job_activity ENABLE ROW LEVEL SECURITY;

--
-- Name: event_job_activity event_job_activity_owner_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY event_job_activity_owner_select ON public.event_job_activity FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.event_jobs j
  WHERE ((j.id = event_job_activity.event_job_id) AND (j.owner_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: event_job_activity event_job_activity_staff_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY event_job_activity_staff_select ON public.event_job_activity FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.event_jobs j
  WHERE ((j.id = event_job_activity.event_job_id) AND (j.owner_id = public.current_staff_owner())))));


--
-- Name: event_job_collection_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_job_collection_items ENABLE ROW LEVEL SECURITY;

--
-- Name: event_job_issues; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_job_issues ENABLE ROW LEVEL SECURITY;

--
-- Name: event_job_notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_job_notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: event_job_notifications event_job_notifications_owner_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY event_job_notifications_owner_select ON public.event_job_notifications FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.event_jobs j
  WHERE ((j.id = event_job_notifications.event_job_id) AND (j.owner_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: event_job_notifications event_job_notifications_staff_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY event_job_notifications_staff_select ON public.event_job_notifications FOR SELECT TO authenticated USING (((recipient_account_id = ( SELECT auth.uid() AS uid)) OR ((recipient_department IS NOT NULL) AND public.current_staff_has_department(recipient_department))));


--
-- Name: event_job_notifications event_job_notifications_staff_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY event_job_notifications_staff_update ON public.event_job_notifications FOR UPDATE TO authenticated USING (((recipient_account_id = ( SELECT auth.uid() AS uid)) OR ((recipient_department IS NOT NULL) AND public.current_staff_has_department(recipient_department)))) WITH CHECK (((recipient_account_id = ( SELECT auth.uid() AS uid)) OR ((recipient_department IS NOT NULL) AND public.current_staff_has_department(recipient_department))));


--
-- Name: event_job_packing_checklist; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_job_packing_checklist ENABLE ROW LEVEL SECURITY;

--
-- Name: event_job_pick_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_job_pick_items ENABLE ROW LEVEL SECURITY;

--
-- Name: event_job_qc_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_job_qc_items ENABLE ROW LEVEL SECURITY;

--
-- Name: event_job_stages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_job_stages ENABLE ROW LEVEL SECURITY;

--
-- Name: event_job_stages event_job_stages_owner_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY event_job_stages_owner_all ON public.event_job_stages TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.event_jobs j
  WHERE ((j.id = event_job_stages.event_job_id) AND (j.owner_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.event_jobs j
  WHERE ((j.id = event_job_stages.event_job_id) AND (j.owner_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: event_job_stages event_job_stages_staff_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY event_job_stages_staff_select ON public.event_job_stages FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.event_jobs j
  WHERE ((j.id = event_job_stages.event_job_id) AND (j.owner_id = public.current_staff_owner())))));


--
-- Name: event_job_stylist_execution; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_job_stylist_execution ENABLE ROW LEVEL SECURITY;

--
-- Name: event_job_stylist_interest; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_job_stylist_interest ENABLE ROW LEVEL SECURITY;

--
-- Name: event_job_stylist_interest event_job_stylist_interest_owner_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY event_job_stylist_interest_owner_select ON public.event_job_stylist_interest FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.event_jobs j
  WHERE ((j.id = event_job_stylist_interest.event_job_id) AND (j.owner_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: event_job_stylist_interest event_job_stylist_interest_owner_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY event_job_stylist_interest_owner_update ON public.event_job_stylist_interest FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.event_jobs j
  WHERE ((j.id = event_job_stylist_interest.event_job_id) AND (j.owner_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.event_jobs j
  WHERE ((j.id = event_job_stylist_interest.event_job_id) AND (j.owner_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: event_job_stylist_interest event_job_stylist_interest_self_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY event_job_stylist_interest_self_select ON public.event_job_stylist_interest FOR SELECT TO authenticated USING ((staff_id = public.current_staff_member_id()));


--
-- Name: event_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: event_jobs event_jobs_owner_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY event_jobs_owner_all ON public.event_jobs TO authenticated USING ((owner_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((owner_id = ( SELECT auth.uid() AS uid)));


--
-- Name: event_jobs event_jobs_staff_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY event_jobs_staff_select ON public.event_jobs FOR SELECT TO authenticated USING (((owner_id = public.current_staff_owner()) AND public.staff_can_access('event_jobs'::text)));


--
-- Name: expenses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

--
-- Name: expenses expenses_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY expenses_owner ON public.expenses TO authenticated USING ((owner_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((owner_id = ( SELECT auth.uid() AS uid)));


--
-- Name: hr_attendance; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hr_attendance ENABLE ROW LEVEL SECURITY;

--
-- Name: hr_attendance hr_attendance_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hr_attendance_owner ON public.hr_attendance TO authenticated USING ((owner_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((owner_id = ( SELECT auth.uid() AS uid)));


--
-- Name: hr_kyc_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hr_kyc_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: hr_kyc_documents hr_kyc_documents_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hr_kyc_documents_owner ON public.hr_kyc_documents TO authenticated USING ((owner_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((owner_id = ( SELECT auth.uid() AS uid)));


--
-- Name: hr_letters; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hr_letters ENABLE ROW LEVEL SECURITY;

--
-- Name: hr_letters hr_letters_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hr_letters_owner ON public.hr_letters TO authenticated USING ((owner_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((owner_id = ( SELECT auth.uid() AS uid)));


--
-- Name: hr_payroll; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hr_payroll ENABLE ROW LEVEL SECURITY;

--
-- Name: hr_payroll hr_payroll_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hr_payroll_owner ON public.hr_payroll TO authenticated USING ((owner_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((owner_id = ( SELECT auth.uid() AS uid)));


--
-- Name: hr_work_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hr_work_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: hr_work_orders hr_work_orders_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hr_work_orders_owner ON public.hr_work_orders TO authenticated USING ((owner_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((owner_id = ( SELECT auth.uid() AS uid)));


--
-- Name: laundry_batch_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.laundry_batch_items ENABLE ROW LEVEL SECURITY;

--
-- Name: laundry_batch_items laundry_batch_items_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY laundry_batch_items_owner ON public.laundry_batch_items TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.laundry_batches b
  WHERE ((b.id = laundry_batch_items.batch_id) AND (b.owner_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.laundry_batches b
  WHERE ((b.id = laundry_batch_items.batch_id) AND (b.owner_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: laundry_batch_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.laundry_batch_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: laundry_batch_notes laundry_batch_notes_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY laundry_batch_notes_owner ON public.laundry_batch_notes TO authenticated USING ((owner_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((owner_id = ( SELECT auth.uid() AS uid)));


--
-- Name: laundry_batches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.laundry_batches ENABLE ROW LEVEL SECURITY;

--
-- Name: laundry_batches laundry_batches_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY laundry_batches_owner ON public.laundry_batches TO authenticated USING ((owner_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((owner_id = ( SELECT auth.uid() AS uid)));


--
-- Name: lead_locked_dates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lead_locked_dates ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_locked_dates lead_locked_dates_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lead_locked_dates_owner ON public.lead_locked_dates TO authenticated USING ((owner_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((owner_id = ( SELECT auth.uid() AS uid)));


--
-- Name: leads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

--
-- Name: leads leads_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leads_owner ON public.leads TO authenticated USING ((owner_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((owner_id = ( SELECT auth.uid() AS uid)));


--
-- Name: package_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.package_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: package_categories package_categories_booking_staff_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY package_categories_booking_staff_select ON public.package_categories FOR SELECT TO authenticated USING (((owner_id = public.current_staff_owner()) AND public.staff_can_access_any(ARRAY['packages'::text, 'quotations'::text, 'bookings'::text, 'create_booking'::text])));


--
-- Name: package_categories package_categories_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY package_categories_insert_own ON public.package_categories FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = owner_id));


--
-- Name: package_categories package_categories_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY package_categories_select_own ON public.package_categories FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = owner_id));


--
-- Name: package_categories package_categories_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY package_categories_update_own ON public.package_categories FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = owner_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = owner_id));


--
-- Name: package_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.package_items ENABLE ROW LEVEL SECURITY;

--
-- Name: package_items package_items_booking_staff_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY package_items_booking_staff_select ON public.package_items FOR SELECT TO authenticated USING (((owner_id = public.current_staff_owner()) AND public.staff_can_access_any(ARRAY['packages'::text, 'quotations'::text, 'bookings'::text, 'create_booking'::text])));


--
-- Name: package_items package_items_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY package_items_insert_own ON public.package_items FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = owner_id));


--
-- Name: package_items package_items_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY package_items_select_own ON public.package_items FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = owner_id));


--
-- Name: package_items package_items_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY package_items_update_own ON public.package_items FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = owner_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = owner_id));


--
-- Name: package_variants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.package_variants ENABLE ROW LEVEL SECURITY;

--
-- Name: package_variants package_variants_booking_staff_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY package_variants_booking_staff_select ON public.package_variants FOR SELECT TO authenticated USING (((owner_id = public.current_staff_owner()) AND public.staff_can_access_any(ARRAY['packages'::text, 'quotations'::text, 'bookings'::text, 'create_booking'::text])));


--
-- Name: package_variants package_variants_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY package_variants_delete_own ON public.package_variants FOR DELETE TO authenticated USING ((( SELECT auth.uid() AS uid) = owner_id));


--
-- Name: package_variants package_variants_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY package_variants_insert_own ON public.package_variants FOR INSERT TO authenticated WITH CHECK (((( SELECT auth.uid() AS uid) = owner_id) AND (EXISTS ( SELECT 1
   FROM public.package_categories category
  WHERE ((category.id = package_variants.category_id) AND (category.owner_id = ( SELECT auth.uid() AS uid)))))));


--
-- Name: package_variants package_variants_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY package_variants_select_own ON public.package_variants FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = owner_id));


--
-- Name: package_variants package_variants_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY package_variants_update_own ON public.package_variants FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = owner_id)) WITH CHECK (((( SELECT auth.uid() AS uid) = owner_id) AND (EXISTS ( SELECT 1
   FROM public.package_categories category
  WHERE ((category.id = package_variants.category_id) AND (category.owner_id = ( SELECT auth.uid() AS uid)))))));


--
-- Name: packages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;

--
-- Name: packages packages_booking_staff_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY packages_booking_staff_select ON public.packages FOR SELECT TO authenticated USING (((owner_id = public.current_staff_owner()) AND public.staff_can_access_any(ARRAY['packages'::text, 'quotations'::text, 'bookings'::text, 'create_booking'::text])));


--
-- Name: packages packages_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY packages_insert_own ON public.packages FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = owner_id));


--
-- Name: packages packages_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY packages_select_own ON public.packages FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = owner_id));


--
-- Name: packages packages_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY packages_update_own ON public.packages FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = owner_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = owner_id));


--
-- Name: product_units; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_units ENABLE ROW LEVEL SECURITY;

--
-- Name: product_units product_units_owner_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY product_units_owner_delete ON public.product_units FOR DELETE TO authenticated USING ((( SELECT auth.uid() AS uid) = owner_id));


--
-- Name: product_units product_units_owner_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY product_units_owner_insert ON public.product_units FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = owner_id));


--
-- Name: product_units product_units_owner_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY product_units_owner_select ON public.product_units FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = owner_id));


--
-- Name: product_units product_units_owner_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY product_units_owner_update ON public.product_units FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = owner_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = owner_id));


--
-- Name: product_units product_units_staff_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY product_units_staff_select ON public.product_units FOR SELECT TO authenticated USING (((owner_id = public.current_staff_owner()) AND public.staff_can_access_any(ARRAY['inventory'::text, 'quotations'::text, 'bookings'::text, 'create_booking'::text])));


--
-- Name: product_variants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

--
-- Name: product_variants product_variants_booking_staff_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY product_variants_booking_staff_select ON public.product_variants FOR SELECT TO authenticated USING (((owner_id = public.current_staff_owner()) AND public.staff_can_access_any(ARRAY['inventory'::text, 'quotations'::text, 'bookings'::text, 'create_booking'::text])));


--
-- Name: product_variants product_variants_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY product_variants_delete_own ON public.product_variants FOR DELETE TO authenticated USING ((( SELECT auth.uid() AS uid) = owner_id));


--
-- Name: product_variants product_variants_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY product_variants_insert_own ON public.product_variants FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = owner_id));


--
-- Name: product_variants product_variants_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY product_variants_select_own ON public.product_variants FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = owner_id));


--
-- Name: product_variants product_variants_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY product_variants_update_own ON public.product_variants FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = owner_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = owner_id));


--
-- Name: products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

--
-- Name: products products_booking_staff_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY products_booking_staff_insert ON public.products FOR INSERT TO authenticated WITH CHECK (((owner_id = public.current_staff_owner()) AND public.staff_can_access_any(ARRAY['inventory'::text, 'quotations'::text, 'bookings'::text, 'create_booking'::text])));


--
-- Name: products products_booking_staff_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY products_booking_staff_select ON public.products FOR SELECT TO authenticated USING (((owner_id = public.current_staff_owner()) AND public.staff_can_access_any(ARRAY['inventory'::text, 'quotations'::text, 'bookings'::text, 'create_booking'::text])));


--
-- Name: products products_booking_staff_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY products_booking_staff_update ON public.products FOR UPDATE TO authenticated USING (((owner_id = public.current_staff_owner()) AND public.staff_can_access_any(ARRAY['inventory'::text, 'quotations'::text, 'bookings'::text, 'create_booking'::text]))) WITH CHECK (((owner_id = public.current_staff_owner()) AND public.staff_can_access_any(ARRAY['inventory'::text, 'quotations'::text, 'bookings'::text, 'create_booking'::text])));


--
-- Name: products products_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY products_insert_own ON public.products FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = owner_id));


--
-- Name: products products_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY products_select_own ON public.products FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = owner_id));


--
-- Name: products products_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY products_update_own ON public.products FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = owner_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = owner_id));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_select_own ON public.profiles FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = id));


--
-- Name: profiles profiles_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = id)) WITH CHECK ((( SELECT auth.uid() AS uid) = id));


--
-- Name: rental_returns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rental_returns ENABLE ROW LEVEL SECURITY;

--
-- Name: rental_returns rental_returns_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rental_returns_insert_own ON public.rental_returns FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = owner_id));


--
-- Name: rental_returns rental_returns_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rental_returns_select_own ON public.rental_returns FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = owner_id));


--
-- Name: rental_returns rental_returns_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rental_returns_update_own ON public.rental_returns FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = owner_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = owner_id));


--
-- Name: staff_access_modules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.staff_access_modules ENABLE ROW LEVEL SECURITY;

--
-- Name: staff_access_modules staff_access_modules_owner_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_access_modules_owner_all ON public.staff_access_modules TO authenticated USING ((owner_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((owner_id = ( SELECT auth.uid() AS uid)));


--
-- Name: staff_access_modules staff_access_modules_self_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_access_modules_self_select ON public.staff_access_modules FOR SELECT TO authenticated USING ((staff_id = public.current_staff_member_id()));


--
-- Name: staff_departments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.staff_departments ENABLE ROW LEVEL SECURITY;

--
-- Name: staff_departments staff_departments_owner_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_departments_owner_all ON public.staff_departments TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.staff_members sm
  WHERE ((sm.id = staff_departments.staff_id) AND (sm.owner_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.staff_members sm
  WHERE ((sm.id = staff_departments.staff_id) AND (sm.owner_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: staff_departments staff_departments_self_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_departments_self_select ON public.staff_departments FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.staff_members sm
  WHERE ((sm.id = staff_departments.staff_id) AND (sm.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: staff_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.staff_members ENABLE ROW LEVEL SECURITY;

--
-- Name: staff_members staff_members_booking_staff_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_members_booking_staff_select ON public.staff_members FOR SELECT TO authenticated USING ((owner_id = public.current_staff_owner()));


--
-- Name: staff_members staff_members_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_members_insert_own ON public.staff_members FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = owner_id));


--
-- Name: staff_members staff_members_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_members_select_own ON public.staff_members FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = owner_id));


--
-- Name: staff_members staff_members_self_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_members_self_select ON public.staff_members FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: staff_members staff_members_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_members_update_own ON public.staff_members FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = owner_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = owner_id));


--
-- Name: staff_performance_credits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.staff_performance_credits ENABLE ROW LEVEL SECURITY;

--
-- Name: staff_performance_credits staff_performance_owner_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_performance_owner_select ON public.staff_performance_credits FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.event_jobs j
  WHERE ((j.id = staff_performance_credits.event_job_id) AND (j.owner_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: staff_performance_credits staff_performance_self_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_performance_self_select ON public.staff_performance_credits FOR SELECT TO authenticated USING (((staff_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.staff_members sm
  WHERE ((sm.id = staff_performance_credits.staff_id) AND (sm.user_id = ( SELECT auth.uid() AS uid)))))));


--
-- Name: stylist_travel_bookings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stylist_travel_bookings ENABLE ROW LEVEL SECURITY;

--
-- Name: vendors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;

--
-- Name: vendors vendors_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vendors_owner ON public.vendors TO authenticated USING ((owner_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((owner_id = ( SELECT auth.uid() AS uid)));


--
-- Name: vouchers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;

--
-- Name: vouchers vouchers_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vouchers_owner ON public.vouchers TO authenticated USING ((owner_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((owner_id = ( SELECT auth.uid() AS uid)));


--
-- PostgreSQL database dump complete
--
