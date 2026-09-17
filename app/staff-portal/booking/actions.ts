'use server';

import { revalidatePath } from 'next/cache';
import { requireDepartment } from '@/lib/staff-portal/guard';
import { closeEventJob } from '@/lib/event-jobs/store';

export type CloseEventFormState = { error: string; closed?: boolean };

function textValue(value: FormDataEntryValue | null) {
  return typeof value === 'string' ? value : '';
}

export async function closeEventJobAction(
  _prevState: CloseEventFormState,
  formData: FormData,
): Promise<CloseEventFormState> {
  const session = await requireDepartment('booking');
  if (!session.isMainId) return { error: 'Only a Booking Main ID can close an Event Job.' };
  const jobId = textValue(formData.get('jobId'));
  if (!jobId) return { error: 'Missing job.' };

  let result;
  try {
    result = await closeEventJob(
      jobId,
      {
        paymentComplete: formData.get('paymentComplete') === 'on',
        depositSettled: formData.get('depositSettled') === 'on',
        damageLossAcknowledged: formData.get('damageLossAcknowledged') === 'on',
        refundAmount: Number(formData.get('refundAmount') ?? 0) || 0,
        additionalPaymentAmount: Number(formData.get('additionalPaymentAmount') ?? 0) || 0,
        notes: textValue(formData.get('notes')).trim(),
      },
      session.name,
    );
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not close the event. Please try again.' };
  }
  if (result.error) return { error: result.error };

  revalidatePath('/staff-portal/booking');
  revalidatePath('/staff-portal/booking/close-jobs');
  revalidatePath('/staff-portal/event-tracking');
  revalidatePath('/event-tracking');
  revalidatePath(`/staff-portal/booking/${jobId}`);
  revalidatePath('/event-jobs');
  revalidatePath(`/event-jobs/${jobId}`);
  revalidatePath('/bookings');
  revalidatePath('/dashboard');
  revalidatePath('/performance');
  if (result.job) revalidatePath(`/track/${result.job.bookingId}`);
  return { error: '', closed: true };
}
