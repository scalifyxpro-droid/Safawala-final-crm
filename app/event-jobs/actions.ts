'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { addIssue, resolveIssue } from '@/lib/event-jobs/store';
import type { EventJobStageKey } from '@/lib/event-jobs/constants';
import { requireUser } from '@/lib/auth/session';

async function requireAdminEmail(): Promise<string> {
  const user = await requireUser().catch(() => null);
  if (!user) redirect('/login');
  if (user.role !== 'admin') redirect('/staff-portal?denied=permission');
  return user.email || 'Admin';
}

function value(formData: FormData, name: string) {
  const input = formData.get(name);
  return typeof input === 'string' ? input : '';
}

export async function addIssueAction(formData: FormData) {
  const raisedBy = await requireAdminEmail();
  const jobId = value(formData, 'jobId');
  const description = value(formData, 'description').trim();
  const stageRaw = value(formData, 'stage');
  if (!jobId || !description) return;
  await addIssue(jobId, description, raisedBy, stageRaw ? (stageRaw as EventJobStageKey) : null);
  revalidatePath(`/event-jobs/${jobId}`);
}

export async function resolveIssueAction(formData: FormData) {
  const resolvedBy = await requireAdminEmail();
  const jobId = value(formData, 'jobId');
  const issueId = value(formData, 'issueId');
  if (!jobId || !issueId) return;
  await resolveIssue(jobId, issueId, resolvedBy);
  revalidatePath(`/event-jobs/${jobId}`);
}
