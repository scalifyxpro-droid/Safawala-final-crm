'use client';

import { useActionState, useState } from 'react';
import { AlertCircle, Check, LoaderCircle, PackageCheck } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { submitPackingChecklistAction, type QcFormState } from '@/app/staff-portal/qc/actions';
import { PackingSlipButton, type PackingSlipDetails, type PackingSlipItem } from '@/components/staff-portal/packing-slip-button';
import { ProofPhotoPicker } from '@/components/staff-portal/proof-photo-picker';

const initialState: QcFormState = { error: '' };

const CHECKS = [
  { name: 'correctQuantityPacked', label: 'Count verified' },
  { name: 'correctBoxes', label: 'Correct boxes used' },
  { name: 'properLabels', label: 'Labels applied' },
  { name: 'accessoriesIncluded', label: 'Accessories included' },
  { name: 'itemsSecured', label: 'Products secured' },
  { name: 'correctEventIdentification', label: 'Event details verified' },
] as const;

export function PackingChecklistForm({
  jobId,
  details,
  items,
}: {
  jobId: string;
  details: PackingSlipDetails;
  items: PackingSlipItem[];
}) {
  const [state, formAction, pending] = useActionState(submitPackingChecklistAction, initialState);
  const [checked, setChecked] = useState(() => CHECKS.map(() => false));
  const [photosValid, setPhotosValid] = useState(false);
  const checkedCount = checked.filter(Boolean).length;
  const ready = checkedCount === CHECKS.length && photosValid;

  return (
    <form action={formAction} className="overflow-hidden rounded-2xl border bg-white dark:bg-card shadow-level-1">
      <input type="hidden" name="jobId" value={jobId} />
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-4 sm:px-5">
        <div>
          <div className="flex items-center gap-2">
            <PackageCheck className="size-5 text-[#9a6a2f]" />
            <h2 className="font-semibold">Packing</h2>
            <Badge variant="outline">{checkedCount}/{CHECKS.length}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Complete the checklist and add proof before dispatch.</p>
        </div>
        <PackingSlipButton details={details} items={items} />
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        {state?.error ? <Alert variant="destructive" className="px-3 py-3" aria-live="polite"><AlertCircle /><AlertDescription>{state.error}</AlertDescription></Alert> : null}

        <div className="grid gap-2 sm:grid-cols-2">
          {CHECKS.map((check, index) => (
            <label key={check.name} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-3.5 transition ${checked[index] ? 'border-emerald-200 bg-emerald-50/70' : 'hover:bg-[#fcfaf7] dark:hover:bg-[#241e17]'}`}>
              <input type="checkbox" name={check.name} checked={checked[index]} onChange={(event) => setChecked((current) => current.map((value, itemIndex) => itemIndex === index ? event.target.checked : value))} className="sr-only" />
              <span className={`grid size-6 shrink-0 place-items-center rounded-md border ${checked[index] ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-[#cfc4b5] text-transparent'}`}><Check className="size-4" /></span>
              <span className="text-sm font-medium">{check.label}</span>
            </label>
          ))}
        </div>

        <ProofPhotoPicker name="proofPhotos" title="Packing proof photos" disabled={pending} onValidityChange={setPhotosValid} />

        <label className="block text-sm">
          <span className="mb-1.5 block text-muted-foreground">Remarks (optional)</span>
          <textarea name="remarks" rows={2} placeholder="Anything the event team should know…" className="w-full resize-y rounded-lg border bg-white dark:bg-card p-3 outline-none focus:border-[#a86f2c] focus:ring-2 focus:ring-[#a86f2c]/15" />
        </label>

        <Button type="submit" disabled={pending || !ready} className="h-11 w-full">
          {pending ? <><LoaderCircle className="animate-spin" /> Uploading &amp; completing…</> : <><Check /> Verify &amp; complete packing</>}
        </Button>
        {!ready ? <p className="text-center text-xs text-muted-foreground">Complete all checks and add at least one proof photo.</p> : null}
      </div>
    </form>
  );
}
