'use server';

import { revalidatePath } from 'next/cache';
import { requireDepartment } from '@/lib/staff-portal/guard';
import { getJob, submitQualityCheck, submitPackingChecklist, submitReturnQualityCheck } from '@/lib/event-jobs/store';
import type { PackingChecklist, QcIssueType, QcItemCheck, ReturnQcItemCheck } from '@/lib/event-jobs/types';
import { withServiceRole } from '@/lib/db/client';
import { deleteFiles, uploadFile } from '@/lib/storage/client';

export type QcFormState = { error: string; success?: boolean };

const PROOF_BUCKET = 'event-operation-files';
const MAX_PROOF_PHOTOS = 3;
const MAX_PROOF_BYTES = 3 * 1024 * 1024;

const QC_ISSUE_TYPES: QcIssueType[] = ['none', 'stain', 'tear', 'missing_part', 'other'];

function textValue(value: FormDataEntryValue | null) {
  return typeof value === 'string' ? value : '';
}

function revalidateJob(jobId: string, bookingId?: number) {
  revalidatePath('/staff-portal/qc');
  revalidatePath(`/staff-portal/qc/${jobId}`);
  revalidatePath('/staff-portal/warehouse');
  revalidatePath('/staff-portal/event-tracking');
  revalidatePath('/event-tracking');
  revalidatePath('/event-jobs');
  revalidatePath(`/event-jobs/${jobId}`);
  if (bookingId) revalidatePath(`/track/${bookingId}`);
}

async function ownerIdForJob(jobId: string): Promise<string | null> {
  const rows = await withServiceRole((tx) =>
    tx<{ owner_id: string }[]>`select owner_id from public.event_jobs where id = ${jobId}`,
  );
  return rows[0]?.owner_id ?? null;
}

export async function submitQualityCheckAction(
  _prevState: QcFormState,
  formData: FormData,
): Promise<QcFormState> {
  const session = await requireDepartment('qc');
  const jobId = textValue(formData.get('jobId'));
  const itemNamesRaw = formData.getAll('itemName');
  if (!jobId || itemNamesRaw.length === 0) {
    return { error: 'This job has no items to check.' };
  }

  const items: QcItemCheck[] = itemNamesRaw.map((itemNameValue, index) => {
    const checkedRaw = textValue(formData.get(`checkedQuantity-${index}`)).trim();
    const goodRaw = textValue(formData.get(`goodQuantity-${index}`)).trim();
    const issueTypeRaw = textValue(formData.get(`issueType-${index}`)) || 'none';
    return {
      itemName: textValue(itemNameValue),
      checkedQuantity: checkedRaw === '' ? null : Number(checkedRaw),
      goodQuantity: goodRaw === '' ? null : Number(goodRaw),
      issueType: QC_ISSUE_TYPES.includes(issueTypeRaw as QcIssueType) ? (issueTypeRaw as QcIssueType) : 'none',
      remarks: textValue(formData.get(`remarks-${index}`)).trim(),
      evidenceNote: textValue(formData.get(`evidenceNote-${index}`)).trim(),
    };
  });

  const result = await submitQualityCheck(jobId, items, session.name);
  if (result.error) return { error: result.error };

  revalidateJob(jobId);
  return { error: '', success: true };
}

export async function submitPackingChecklistAction(
  _prevState: QcFormState,
  formData: FormData,
): Promise<QcFormState> {
  const session = await requireDepartment('qc');
  const jobId = textValue(formData.get('jobId'));
  if (!jobId) return { error: 'Missing job.' };

  const checklist: Omit<PackingChecklist, 'completedAt' | 'completedBy'> = {
    correctQuantityPacked: formData.get('correctQuantityPacked') === 'on',
    correctBoxes: formData.get('correctBoxes') === 'on',
    properLabels: formData.get('properLabels') === 'on',
    accessoriesIncluded: formData.get('accessoriesIncluded') === 'on',
    itemsSecured: formData.get('itemsSecured') === 'on',
    correctEventIdentification: formData.get('correctEventIdentification') === 'on',
    remarks: textValue(formData.get('remarks')).trim(),
    proofPhotoPaths: [],
  };

  const allChecked = Object.entries(checklist)
    .filter(([key]) => key !== 'remarks' && key !== 'proofPhotoPaths')
    .every(([, value]) => value === true);
  if (!allChecked) return { error: 'Complete every packing check before submitting.' };

  const proofPhotos = formData
    .getAll('proofPhotos')
    .filter((value): value is File => value instanceof File && value.size > 0);
  if (proofPhotos.length === 0) return { error: 'Add at least one packing proof photo.' };
  if (proofPhotos.length > MAX_PROOF_PHOTOS) return { error: `Add no more than ${MAX_PROOF_PHOTOS} proof photos.` };
  if (proofPhotos.some((file) => !file.type.startsWith('image/'))) return { error: 'Proof files must be images.' };
  if (proofPhotos.some((file) => file.size > MAX_PROOF_BYTES)) return { error: 'Each proof photo must be 3 MB or smaller.' };

  const job = await getJob(jobId);
  const packingStage = job?.stages.find((stage) => stage.key === 'packing');
  if (!job || job.qualityCheck === null || !packingStage || !['open', 'in_progress'].includes(packingStage.status)) {
    return { error: 'Packing is not open for this job.' };
  }

  const ownerId = await ownerIdForJob(jobId);
  if (!ownerId) return { error: 'Could not verify this job for proof upload.' };

  const uploadedPaths: string[] = [];
  try {
    for (const [index, photo] of proofPhotos.entries()) {
      const extension = photo.name.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'jpg';
      const path = `${ownerId}/qc/${jobId}/${Date.now()}-${index}.${extension}`;
      const uploaded = await uploadFile(PROOF_BUCKET, path, photo);
      uploadedPaths.push(uploaded.path);
    }
  } catch (error) {
    await deleteFiles(PROOF_BUCKET, uploadedPaths).catch(() => undefined);
    return { error: error instanceof Error ? `Proof photo upload failed: ${error.message}` : 'Proof photo upload failed.' };
  }
  checklist.proofPhotoPaths = uploadedPaths;

  const result = await submitPackingChecklist(jobId, checklist, session.name);
  if (result.error) {
    await deleteFiles(PROOF_BUCKET, uploadedPaths).catch(() => undefined);
    return { error: result.error };
  }

  revalidateJob(jobId);
  return { error: '', success: true };
}

export async function submitReturnQualityCheckAction(
  _prevState: QcFormState,
  formData: FormData,
): Promise<QcFormState> {
  const session = await requireDepartment('qc');
  const jobId = textValue(formData.get('jobId'));
  const itemNamesRaw = formData.getAll('itemName');
  if (!jobId || itemNamesRaw.length === 0) {
    return { error: 'This job has no returned items to check.' };
  }

  const items: ReturnQcItemCheck[] = itemNamesRaw.map((itemNameValue, index) => {
    const returnedQuantity = Number(formData.get(`returnedQuantity-${index}`) ?? 0);
    const goodRaw = textValue(formData.get(`goodQuantity-${index}`)).trim();
    const damagedRaw = textValue(formData.get(`damagedQuantity-${index}`)).trim();
    return {
      itemName: textValue(itemNameValue),
      returnedQuantity,
      goodQuantity: goodRaw === '' ? null : Number(goodRaw),
      damagedQuantity: damagedRaw === '' ? null : Number(damagedRaw),
      repairRequired: formData.get(`repairRequired-${index}`) === 'on',
      unusable: formData.get(`unusable-${index}`) === 'on',
      remarks: textValue(formData.get(`remarks-${index}`)).trim(),
      evidenceNote: textValue(formData.get(`evidenceNote-${index}`)).trim(),
    };
  });

  const issuePhotos = formData
    .getAll('issuePhotos')
    .filter((value): value is File => value instanceof File && value.size > 0);
  if (issuePhotos.length > MAX_PROOF_PHOTOS) return { error: `Add no more than ${MAX_PROOF_PHOTOS} issue photos.` };
  if (issuePhotos.some((file) => !file.type.startsWith('image/'))) return { error: 'Issue proof files must be images.' };
  if (issuePhotos.some((file) => file.size > MAX_PROOF_BYTES)) return { error: 'Each issue photo must be 3 MB or smaller.' };

  const hasIssue = items.some((item) =>
    (item.damagedQuantity ?? 0) > 0 || item.repairRequired || item.unusable,
  );
  if (hasIssue && issuePhotos.length === 0) {
    return { error: 'Add at least one proof photo for damaged, repair, or unusable products.' };
  }

  const job = await getJob(jobId);
  const returnStage = job?.stages.find((stage) => stage.key === 'return_quality_check');
  if (!job || job.bookingType !== 'rental' || !job.collectionCheck || !returnStage || !['open', 'in_progress'].includes(returnStage.status)) {
    return { error: 'Return QC is not open for this rental job.' };
  }

  const uploadedPaths: string[] = [];
  if (issuePhotos.length) {
    const ownerId = await ownerIdForJob(jobId);
    if (!ownerId) return { error: 'Could not verify this job for issue-photo upload.' };

    try {
      for (const [index, photo] of issuePhotos.entries()) {
        const extension = photo.name.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'jpg';
        const path = `${ownerId}/return-qc/${jobId}/${Date.now()}-${index}.${extension}`;
        const uploaded = await uploadFile(PROOF_BUCKET, path, photo);
        uploadedPaths.push(uploaded.path);
      }
    } catch (error) {
      await deleteFiles(PROOF_BUCKET, uploadedPaths).catch(() => undefined);
      return { error: error instanceof Error ? `Issue photo upload failed: ${error.message}` : 'Issue photo upload failed.' };
    }
  }

  let result;
  try {
    result = await submitReturnQualityCheck(jobId, items, session.name, uploadedPaths);
  } catch (error) {
    await deleteFiles(PROOF_BUCKET, uploadedPaths).catch(() => undefined);
    return { error: error instanceof Error ? error.message : 'Could not save Return QC. Please try again.' };
  }
  if (result.error) {
    await deleteFiles(PROOF_BUCKET, uploadedPaths).catch(() => undefined);
    return { error: result.error };
  }

  revalidateJob(jobId, result.job?.bookingId);
  return { error: '', success: true };
}
