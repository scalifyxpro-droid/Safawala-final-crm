'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { confirmStylistTicketSent } from '@/lib/event-jobs/store';
import { requireUser } from '@/lib/auth/session';
import { withUserContext } from '@/lib/db/client';
import { uploadFile } from '@/lib/storage/client';

const TICKET_BUCKET = 'stylist-tickets';
const ALLOWED_TICKET_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const MAX_TICKET_BYTES = 10 * 1024 * 1024;

function formText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

async function requireAdminEmail(): Promise<string> {
  const user = await requireUser();
  const [profile] = await withUserContext(user.id, (tx) => tx<{ role: string }[]>`
    select role from public.profiles where id = ${user.id}
  `);
  if (profile?.role !== 'admin') redirect('/staff-portal?denied=permission');
  return user.email ?? 'Admin';
}

export async function confirmTicketSentAction(formData: FormData) {
  const confirmedBy = await requireAdminEmail();
  const jobId = formText(formData, 'jobId');
  const interestId = formText(formData, 'interestId');
  if (!jobId || !interestId) return;
  const result = await confirmStylistTicketSent(jobId, interestId, confirmedBy);
  if (result.error) redirect(`/travel/${jobId}/${interestId}?error=${encodeURIComponent(result.error)}`);
  revalidatePath('/travel');
  revalidatePath(`/travel/${jobId}/${interestId}`);
  revalidatePath('/staff-portal/notifications');
  revalidatePath('/staff-portal/stylist/assigned');
  redirect(`/travel/${jobId}/${interestId}?confirmed=1`);
}

// Admin uploads the actual ticket document (PDF or image) for one approved
// stylist assignment. The file is stored in a private bucket (never public --
// tickets can carry personal travel details) and the stylist only ever sees it
// through a short-lived signed URL generated server-side. Saving the ticket also
// fires the account-targeted notification the stylist sees in their portal (see
// confirmStylistTicketSent / lib/notifications/store.ts).
export async function uploadTicketAction(formData: FormData) {
  const confirmedBy = await requireAdminEmail();
  const jobId = formText(formData, 'jobId');
  const interestId = formText(formData, 'interestId');
  if (!jobId || !interestId) return;

  const file = formData.get('ticket');
  if (!(file instanceof File) || file.size === 0) {
    redirect(`/travel/${jobId}/${interestId}?error=${encodeURIComponent('Choose a ticket file (PDF, JPG, PNG or WEBP) to upload.')}`);
  }
  if (file.size > MAX_TICKET_BYTES) {
    redirect(`/travel/${jobId}/${interestId}?error=${encodeURIComponent('That file is too large. Tickets must be 10MB or smaller.')}`);
  }
  if (file.type && !ALLOWED_TICKET_TYPES.has(file.type)) {
    redirect(`/travel/${jobId}/${interestId}?error=${encodeURIComponent('Tickets must be a PDF, JPG, PNG or WEBP file.')}`);
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
  const path = `${jobId}/${interestId}-${Date.now()}-${safeName}`;
  let uploaded;
  try {
    uploaded = await uploadFile(TICKET_BUCKET, path, file);
  } catch (error) {
    redirect(`/travel/${jobId}/${interestId}?error=${encodeURIComponent(error instanceof Error ? error.message : 'Ticket upload failed.')}`);
  }

  const result = await confirmStylistTicketSent(jobId, interestId, confirmedBy, {
    path: uploaded.path,
    name: uploaded.name,
  });
  if (result.error) redirect(`/travel/${jobId}/${interestId}?error=${encodeURIComponent(result.error)}`);
  revalidatePath('/travel');
  revalidatePath(`/travel/${jobId}/${interestId}`);
  revalidatePath('/staff-portal/notifications');
  revalidatePath('/staff-portal/stylist/assigned');
  redirect(`/travel/${jobId}/${interestId}?confirmed=1`);
}
