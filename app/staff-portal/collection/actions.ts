'use server';

import { revalidatePath } from 'next/cache';
import { requireDepartment } from '@/lib/staff-portal/guard';
import { submitCollectionCheck } from '@/lib/event-jobs/store';
import type { CollectionItemCheck } from '@/lib/event-jobs/types';

export type CollectionFormState = { error: string };

function formText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

export async function submitCollectionCheckAction(
  _prevState: CollectionFormState,
  formData: FormData,
): Promise<CollectionFormState> {
  try {
    const session = await requireDepartment('collection');
    const jobId = formText(formData, 'jobId');
    const itemNamesRaw = formData.getAll('itemName');
    if (!jobId || itemNamesRaw.length === 0) {
      return { error: 'This job has no items to collect.' };
    }
    if (formData.get('handoverConfirmed') !== 'on') {
      return { error: 'Confirm that the products were handed over before completing collection.' };
    }

    const items: CollectionItemCheck[] = itemNamesRaw.map((itemNameValue, index) => {
      const sentQuantity = Number(formData.get(`sentQuantity-${index}`) ?? 0);
      const returnedRaw = formText(formData, `returnedQuantity-${index}`).trim();
      return {
        itemName: typeof itemNameValue === 'string' ? itemNameValue : '',
        sentQuantity,
        returnedQuantity: returnedRaw === '' ? null : Number(returnedRaw),
        visibleDamage: formData.get(`visibleDamage-${index}`) === 'on',
        wrongProduct: formData.get(`wrongProduct-${index}`) === 'on',
        clientHoldingItem: formData.get(`clientHoldingItem-${index}`) === 'on',
        shortQuantity: formData.get(`shortQuantity-${index}`) === 'on',
        remarks: formText(formData, `remarks-${index}`).trim(),
        evidenceNote: formText(formData, `evidenceNote-${index}`).trim(),
      };
    });

    const result = await submitCollectionCheck(jobId, items, session.name, {
      collectedFrom: formText(formData, 'collectedFrom'),
      handedOverTo: formText(formData, 'handedOverTo'),
      handoverNotes: formText(formData, 'handoverNotes'),
    });
    if (result.error) return { error: result.error };

    revalidatePath('/staff-portal/collection');
    revalidatePath(`/staff-portal/collection/${jobId}`);
    revalidatePath('/staff-portal/qc');
    revalidatePath('/event-jobs');
    revalidatePath(`/event-jobs/${jobId}`);
    return { error: '' };
  } catch (error) {
    console.error('[collection] Failed to complete collection', error);
    return { error: 'Collection could not be saved. Please refresh and try again.' };
  }
}
