'use server';

import { revalidatePath } from 'next/cache';
import { assignStylists, decideStylistInterest, setStylistsRequiredCount } from '@/lib/event-jobs/store';
import type { StylistInterestStatus } from '@/lib/event-jobs/types';
import { requireUser } from '@/lib/auth/session';
import { withUserContext } from '@/lib/db/client';

async function requireAdminEmail(): Promise<string> {
  const user = await requireUser();
  const [profile] = await withUserContext(user.id, (tx) => tx<{ role: string }[]>`
    select role from public.profiles where id = ${user.id}
  `);
  if (profile?.role !== 'admin') throw new Error('Only an administrator can manage stylist assignments.');
  return user.email ?? 'Admin';
}

const DECISIONS: StylistInterestStatus[] = ['approved', 'rejected', 'backup'];

function formText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

export type AssignStylistsActionState = { error: string; saved: boolean };

export async function approveStylistSelectionAction(
  _previous: AssignStylistsActionState,
  formData: FormData,
): Promise<AssignStylistsActionState> {
  const decidedBy = await requireAdminEmail();
  const jobId = formText(formData, 'jobId');
  const interestIds = formData.getAll('interestId').filter((value): value is string => typeof value === 'string' && Boolean(value));
  if (!jobId) return { error: 'Event was not found.', saved: false };
  const result = await assignStylists(jobId, interestIds, decidedBy);
  if (result.error) return { error: result.error, saved: false };
  revalidatePath('/stylist-approvals');
  revalidatePath(`/event-jobs/${jobId}`);
  revalidatePath('/staff-portal/stylist');
  revalidatePath('/staff-portal/stylist/assigned');
  return { error: '', saved: true };
}

export async function decideInterestAction(formData: FormData) {
  const decidedBy = await requireAdminEmail();
  const jobId = formText(formData, 'jobId');
  const interestId = formText(formData, 'interestId');
  const decisionRaw = formText(formData, 'decision');
  if (!jobId || !interestId || !DECISIONS.includes(decisionRaw as StylistInterestStatus)) return;
  await decideStylistInterest(jobId, interestId, decisionRaw as StylistInterestStatus, decidedBy);
  revalidatePath('/stylist-approvals');
  revalidatePath(`/event-jobs/${jobId}`);
}

export async function setStylistsRequiredAction(formData: FormData) {
  await requireAdminEmail();
  const jobId = formText(formData, 'jobId');
  const countRaw = formText(formData, 'count');
  const count = Number(countRaw);
  if (!jobId || Number.isNaN(count) || count < 0) return;
  await setStylistsRequiredCount(jobId, count);
  revalidatePath('/stylist-approvals');
  revalidatePath(`/event-jobs/${jobId}`);
}
