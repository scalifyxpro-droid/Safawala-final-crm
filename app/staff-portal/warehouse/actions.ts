'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireDepartment } from '@/lib/staff-portal/guard';
import { submitWarehousePreparation, submitReturnWarehouseCheck } from '@/lib/event-jobs/store';
import type { ReturnWarehouseItemResult, WarehouseItemPrep } from '@/lib/event-jobs/types';

export type WarehousePrepFormState = { error: string };

function textValue(value: FormDataEntryValue | null) {
  return typeof value === 'string' ? value : '';
}

export async function submitWarehousePrepAction(
  _prevState: WarehousePrepFormState,
  formData: FormData,
): Promise<WarehousePrepFormState> {
  const session = await requireDepartment('warehouse');
  const jobId = textValue(formData.get('jobId'));
  const itemNamesRaw = formData.getAll('itemName');
  if (!jobId || itemNamesRaw.length === 0) {
    return { error: 'This job has no items to prepare.' };
  }

  const items: WarehouseItemPrep[] = itemNamesRaw.map((itemNameValue, index) => {
    const itemName = textValue(itemNameValue);
    const requiredQuantity = Number(textValue(formData.get(`requiredQuantity-${index}`)) || 0);
    const picked = formData.get(`picked-${index}`) === 'on';
    return {
      itemName,
      requiredQuantity,
      preparedQuantity: picked ? requiredQuantity : 0,
      unavailable: !picked,
      damaged: false,
      otherIssue: '',
      remarks: '',
    };
  });
  if (!items.some((item) => (item.preparedQuantity ?? 0) > 0)) {
    return { error: 'Select at least one picked product before submitting.' };
  }

  const result = await submitWarehousePreparation(jobId, items, session.name);
  if (result.error) return { error: result.error };

  revalidatePath('/staff-portal/warehouse');
  revalidatePath(`/staff-portal/warehouse/${jobId}`);
  revalidatePath('/event-jobs');
  revalidatePath(`/event-jobs/${jobId}`);
  redirect('/staff-portal/warehouse?completed=' + encodeURIComponent(jobId));
}

export type ReturnWarehouseFormState = { error: string; success?: boolean };

export async function submitReturnWarehouseAction(
  _prevState: ReturnWarehouseFormState,
  formData: FormData,
): Promise<ReturnWarehouseFormState> {
  const session = await requireDepartment('warehouse');
  const jobId = textValue(formData.get('jobId'));
  const itemNamesRaw = formData.getAll('itemName');
  if (!jobId || itemNamesRaw.length === 0) {
    return { error: 'This job has no returned items to sort.' };
  }

  const items: ReturnWarehouseItemResult[] = itemNamesRaw.map((itemNameValue, index) => ({
    itemName: textValue(itemNameValue),
    usableQuantity: Number(textValue(formData.get(`usableQuantity-${index}`)) || 0),
    damagedRepairQuantity: Number(textValue(formData.get(`damagedRepairQuantity-${index}`)) || 0),
    missingLostQuantity: Number(textValue(formData.get(`missingLostQuantity-${index}`)) || 0),
    storageLocation: textValue(formData.get(`storageLocation-${index}`)).trim(),
    remarks: textValue(formData.get(`remarks-${index}`)).trim(),
  }));

  let result;
  try {
    result = await submitReturnWarehouseCheck(jobId, items, session.name, {
      receivedFrom: textValue(formData.get('receivedFrom')).trim(),
      receivingNotes: textValue(formData.get('receivingNotes')).trim(),
      handoverConfirmed: formData.get('handoverConfirmed') === 'on',
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not save Return Warehouse. Please try again.' };
  }
  if (result.error) return { error: result.error };

  revalidatePath('/staff-portal/warehouse');
  revalidatePath(`/staff-portal/warehouse/${jobId}`);
  revalidatePath('/staff-portal/booking/close-jobs');
  revalidatePath('/staff-portal/event-tracking');
  revalidatePath('/event-tracking');
  revalidatePath('/event-jobs');
  revalidatePath(`/event-jobs/${jobId}`);
  if (result.job) revalidatePath(`/track/${result.job.bookingId}`);
  return { error: '', success: true };
}
