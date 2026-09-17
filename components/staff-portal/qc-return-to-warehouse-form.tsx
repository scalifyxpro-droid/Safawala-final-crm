'use client';

import { useActionState } from 'react';
import { AlertTriangle, LoaderCircle, RotateCcw } from 'lucide-react';
import { sendQcIssueToWarehouseAction, type QcFormState } from '@/app/staff-portal/qc/actions';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

const initialState: QcFormState = { error: '' };

export function QcReturnToWarehouseForm({ jobId, items }: { jobId: string; items: { itemName: string }[] }) {
  const [state, formAction, pending] = useActionState(sendQcIssueToWarehouseAction, initialState);

  return (
    <form action={formAction} className="mt-4 rounded-xl border border-amber-200 bg-white p-4 dark:bg-card sm:p-5">
      <input type="hidden" name="jobId" value={jobId} />
      <div className="flex items-start gap-2">
        <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-amber-700" />
        <div>
          <h3 className="font-semibold">Found an issue after QC?</h3>
          <p className="mt-1 text-sm text-muted-foreground">Choose the product and describe the issue. Sending it back reopens Warehouse picking and requires QC and packing again.</p>
        </div>
      </div>
      {state.error ? <Alert variant="destructive" className="mt-4" aria-live="polite"><AlertTriangle /><AlertDescription>{state.error}</AlertDescription></Alert> : null}
      {state.success ? <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" aria-live="polite">Sent to Warehouse. The job is now in its open queue.</p> : null}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="min-w-0 text-sm font-medium">Product
          <select name="itemName" required defaultValue="" className="mt-1.5 h-10 w-full rounded-lg border border-border bg-white px-3 text-sm dark:bg-card">
            <option value="" disabled>Select product</option>
            {items.map((item) => <option key={item.itemName} value={item.itemName}>{item.itemName}</option>)}
          </select>
        </label>
        <label className="min-w-0 text-sm font-medium">Issue
          <select name="issueType" required defaultValue="" className="mt-1.5 h-10 w-full rounded-lg border border-border bg-white px-3 text-sm dark:bg-card">
            <option value="" disabled>Select issue</option>
            <option value="stain">Stain</option>
            <option value="tear">Tear</option>
            <option value="missing_part">Missing part</option>
            <option value="other">Other</option>
          </select>
        </label>
      </div>
      <label className="mt-3 block text-sm font-medium">What should Warehouse correct?
        <textarea name="remarks" required maxLength={500} rows={2} placeholder="Describe the problem briefly" className="mt-1.5 w-full resize-y rounded-lg border border-border bg-white px-3 py-2 text-sm dark:bg-card" />
      </label>
      <Button type="submit" disabled={pending || state.success} variant="outline" className="mt-3 h-10 w-full border-amber-300 text-amber-900 hover:bg-amber-50 sm:w-auto">
        {pending ? <LoaderCircle className="animate-spin" /> : <RotateCcw />} Send back to Warehouse
      </Button>
    </form>
  );
}
