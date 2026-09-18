'use client';

import { useActionState, useState } from 'react';
import { AlertCircle, Check, ClipboardCheck, LoaderCircle, X } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { submitQualityCheckAction, type QcFormState } from '@/app/staff-portal/qc/actions';
import { QcPhotoPicker } from '@/components/staff-portal/qc-photo-picker';

const initialState: QcFormState = { error: '' };

export type QcReviewItem = {
  itemName: string;
  quantity: number;
  barcode: string | null;
};

type ReviewDecision = 'pass' | 'fail' | null;

const ISSUE_OPTIONS = [
  { value: 'stain', label: 'Stain' },
  { value: 'tear', label: 'Tear' },
  { value: 'missing_part', label: 'Missing part' },
  { value: 'other', label: 'Other' },
] as const;

export function QualityCheckForm({ jobId, items }: { jobId: string; items: QcReviewItem[] }) {
  const [photos, setPhotos] = useState<File[]>([]);
  const [state, formAction, pending] = useActionState(async (previous: QcFormState, form: FormData) => {
    form.delete('qcProofPhotos');
    photos.forEach((photo) => form.append('qcProofPhotos', photo));
    return submitQualityCheckAction(previous, form);
  }, initialState);
  const [decisions, setDecisions] = useState<ReviewDecision[]>(() => items.map(() => null));
  const photosValid = photos.length > 0 && photos.length <= 3;
  const reviewedCount = decisions.filter(Boolean).length;
  const allReviewed = reviewedCount === items.length;

  if (items.length === 0) {
    return <section className="rounded-2xl border bg-white dark:bg-card p-5 text-sm text-muted-foreground shadow-level-1">No picked rental products are available for quality checking.</section>;
  }

  return (
    <form action={formAction} className="overflow-hidden rounded-2xl border bg-white dark:bg-card shadow-level-1">
      <input type="hidden" name="jobId" value={jobId} />
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-4 sm:px-5">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardCheck className="size-5 text-[#9a6a2f]" />
            <h2 className="font-semibold">Quality check</h2>
            <Badge variant="outline">{reviewedCount}/{items.length} reviewed</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Pass or flag every picked product.</p>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#eee7dd] sm:w-36">
          <div className="h-full rounded-full bg-[#a86f2c] transition-all" style={{ width: `${(reviewedCount / items.length) * 100}%` }} />
        </div>
      </div>

      <div className="space-y-3 p-4 sm:p-5">
        {state?.error ? <Alert variant="destructive" className="px-3 py-3" aria-live="polite"><AlertCircle /><AlertDescription>{state.error}</AlertDescription></Alert> : null}

        <ul className="space-y-3">
          {items.map((item, index) => {
            const decision = decisions[index];
            return (
              <li key={`${item.itemName}-${index}`} className={`rounded-xl border p-3 transition ${decision === 'pass' ? 'border-emerald-200 bg-emerald-50/70' : decision === 'fail' ? 'border-red-200 bg-red-50/60' : 'bg-white dark:bg-card'}`}>
                <input type="hidden" name="itemName" value={item.itemName} />
                <input type="hidden" name={`checkedQuantity-${index}`} value={item.quantity} />
                <input type="hidden" name={`goodQuantity-${index}`} value={decision === 'pass' ? item.quantity : decision === 'fail' ? 0 : ''} />
                {decision !== 'fail' ? <input type="hidden" name={`issueType-${index}`} value="none" /> : null}
                <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                  <span className="min-w-0 basis-full flex-1 sm:basis-auto">
                    <strong className="block truncate text-sm font-medium">{item.itemName}</strong>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{item.barcode ? `Barcode: ${item.barcode}` : 'No barcode'} · Quantity {item.quantity}</span>
                  </span>
                  <Button type="button" size="sm" variant="outline" aria-label={`Flag ${item.itemName} with an issue`} className={decision === 'fail' ? 'border-red-500 bg-red-600 text-white hover:bg-red-700 hover:text-white' : ''} onClick={() => setDecisions((current) => current.map((value, itemIndex) => itemIndex === index ? 'fail' : value))}><X /> Issue</Button>
                  <Button type="button" size="sm" variant="outline" aria-label={`Pass ${item.itemName}`} className={decision === 'pass' ? 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700 hover:text-white' : ''} onClick={() => setDecisions((current) => current.map((value, itemIndex) => itemIndex === index ? 'pass' : value))}><Check /> Pass</Button>
                </div>
                {decision === 'fail' ? (
                  <div className="mt-3 grid gap-2 border-t border-red-200 pt-3 sm:grid-cols-2">
                    <label className="text-sm"><span className="mb-1 block text-muted-foreground">Issue</span><select name={`issueType-${index}`} defaultValue="other" className="h-10 w-full rounded-lg border bg-white dark:bg-card px-3">{ISSUE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                    <label className="text-sm"><span className="mb-1 block text-muted-foreground">Remarks (optional)</span><input name={`remarks-${index}`} placeholder="Short issue note" className="h-10 w-full rounded-lg border bg-white dark:bg-card px-3" /></label>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>

        <QcPhotoPicker files={photos} onChange={setPhotos} disabled={pending} />

        <Button type="submit" disabled={pending || !allReviewed || !photosValid} className="h-11 w-full">
          {pending ? <><LoaderCircle className="animate-spin" /> Submitting…</> : decisions.includes('fail') ? <><AlertCircle /> Return rejected items to warehouse</> : <><Check /> Submit quality check</>}
        </Button>
        {!allReviewed || !photosValid ? <p className="text-center text-xs text-muted-foreground">Review every product and add at least one proof photo to continue.</p> : null}
      </div>
    </form>
  );
}
