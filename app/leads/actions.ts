'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/session';
import { withUserContext } from '@/lib/db/client';

function databaseError(error: unknown, fallback: string) {
  const err = error as { code?: string; message?: string };
  if (err?.code === '42P01') {
    return 'Leads database tables are not installed. Apply railway/schema/002_app_schema.sql, then try again.';
  }
  return err?.message || fallback;
}

export async function createLeadAction(formData: FormData) {
  const user = await requireUser();
  const text = (name: string) => {
    const value = formData.get(name);
    return typeof value === 'string' ? value.trim() : '';
  };
  if (!/^\d{10}$/.test(text('phone'))) throw new Error('WhatsApp / Phone must contain exactly 10 digits.');
  const assignedStaffId = text('assigned_staff_id') ? Number(text('assigned_staff_id')) : null;
  try {
    await withUserContext(user.id, async (tx) => {
      await tx`
        insert into public.leads (owner_id, full_name, phone, email, event_date, location, package_interest, source, status, assigned_staff_id, requirements, internal_notes)
        values (${user.id}, ${text('full_name')}, ${text('phone')}, ${text('email') || null}, ${text('event_date')}, ${text('location') || null},
                ${text('package_interest') || null}, ${text('source') || 'Manual Entry'}, ${text('status') || 'new'}, ${assignedStaffId},
                ${text('requirements') || null}, ${text('internal_notes') || null})
      `;
      await tx`
        insert into public.admin_notifications (owner_id, title, message, href)
        values (${user.id}, 'New Lead Added', ${`${text('full_name')} has been added to the leads center.`}, '/leads')
      `;
    });
  } catch (error) {
    throw new Error(databaseError(error, 'Unable to save lead.'));
  }
  revalidatePath('/leads');
}

export async function createLockedDateAction(formData: FormData) {
  const user = await requireUser();
  const text = (name: string) => {
    const value = formData.get(name);
    return typeof value === 'string' ? value.trim() : '';
  };
  const date = text('locked_date');
  const label = text('label');
  const notes = text('notes') || null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw new Error('Choose a valid date.');
  }
  if (!label) throw new Error('Enter a label for the locked date.');
  try {
    await withUserContext(user.id, async (tx) => {
      await tx`
        insert into public.lead_locked_dates (owner_id, locked_date, label, notes)
        values (${user.id}, ${date}, ${label}, ${notes})
      `;
      await tx`
        insert into public.admin_notifications (owner_id, title, message, href)
        values (${user.id}, 'Date Locked', ${`${label} · ${date}`}, '/leads?view=locked-dates')
      `;
    });
  } catch (error) {
    const err = error as { code?: string };
    throw new Error(err?.code === '23505' ? 'That date is already locked.' : databaseError(error, 'Unable to lock date.'));
  }
  revalidatePath('/leads');
  revalidatePath('/dashboard');
  revalidatePath('/bookings/calendar');
}

export async function deleteLockedDateAction(formData: FormData) {
  const user = await requireUser();
  const id = Number(formData.get('id'));
  await withUserContext(user.id, (tx) => tx`delete from public.lead_locked_dates where id = ${id} and owner_id = ${user.id}`);
  revalidatePath('/leads');
  revalidatePath('/dashboard');
  revalidatePath('/bookings/calendar');
}
