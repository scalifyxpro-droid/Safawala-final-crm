'use server';

import { revalidatePath } from 'next/cache';
import { requireStylistSession } from '@/lib/staff-portal/guard';
import { recordStylistExecution, type ExecutionAction } from '@/lib/event-jobs/store';
import { sendStylistArrivalOtp, verifyStylistArrivalOtp } from '@/lib/event-jobs/stylist-arrival';

const ACTIONS: ExecutionAction[] = ['complete_work'];

function formText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

export async function recordExecutionAction(formData: FormData) {
  const session = await requireStylistSession();
  const jobId = formText(formData, 'jobId');
  const actionRaw = formText(formData, 'action');
  const remarks = formText(formData, 'remarks').trim();
  if (!jobId || !ACTIONS.includes(actionRaw as ExecutionAction)) return { error: 'Invalid action.' };
  const result = await recordStylistExecution(jobId, session.id, session.name, actionRaw as ExecutionAction, remarks);
  if (result.error) return { error: result.error };
  revalidatePath('/staff-portal/stylist/assigned');
  revalidatePath('/staff-portal/stylist');
  revalidatePath('/staff-portal/collection');
  revalidatePath('/staff-portal/event-tracking');
  revalidatePath('/event-tracking');
  revalidatePath(`/event-jobs/${jobId}`);
  return { success: true };
}

export async function requestArrivalOtpAction(jobId: string) {
  const session = await requireStylistSession();
  return sendStylistArrivalOtp(jobId, session.id);
}

export async function verifyArrivalOtpAction(jobId: string, code: string) {
  const session = await requireStylistSession();
  const result = await verifyStylistArrivalOtp(jobId, session.id, session.name, code);
  if (result.success) {
    revalidatePath('/staff-portal/stylist/assigned');
    revalidatePath('/staff-portal/stylist');
    revalidatePath('/staff-portal/event-tracking');
    revalidatePath('/event-tracking');
    revalidatePath(`/event-jobs/${jobId}`);
  }
  return result;
}
