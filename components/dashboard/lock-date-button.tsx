'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LockKeyhole, Plus, Trash2, X } from 'lucide-react';
import { createLockedDateAction, deleteLockedDateAction } from '@/app/leads/actions';
import { Button } from '@/components/ui/button';

type LockedDate = { id: number; locked_date: string; label: string; notes: string | null };

export function LockDateButton({ dates, loadError = false }: { dates: LockedDate[]; loadError?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) setOpen(false); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, busy]);

  async function addDate(formData: FormData) {
    setBusy(true);
    setError('');
    try {
      await createLockedDateAction(formData);
      router.refresh();
      const form = document.getElementById('dashboard-lock-date-form') as HTMLFormElement | null;
      form?.reset();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to lock date.');
    } finally {
      setBusy(false);
    }
  }

  async function removeDate(id: number) {
    setBusy(true);
    setError('');
    try {
      const formData = new FormData();
      formData.set('id', String(id));
      await deleteLockedDateAction(formData);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to remove locked date.');
    } finally {
      setBusy(false);
    }
  }

  return <>
    <Button type="button" variant="outline" size="sm" onClick={() => { setError(''); setOpen(true); }} className="flex-1 border-[#d7b482] bg-white text-[#70481c] hover:bg-[#fff7eb] dark:bg-[#241e17] sm:flex-none">
      <LockKeyhole className="size-4" /> Lock date
    </Button>
    {open ? <div role="presentation" className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-3 sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setOpen(false); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="lock-date-title" className="flex max-h-[min(90dvh,780px)] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-[#e4d2b6] bg-white shadow-level-3 dark:border-[#493822] dark:bg-card">
        <div className="flex items-start justify-between gap-4 border-b border-border bg-[#fcfaf7] px-4 py-4 dark:bg-[#241e17] sm:px-6">
          <div className="min-w-0"><h2 id="lock-date-title" className="flex items-center gap-2 text-lg font-semibold"><LockKeyhole className="size-5 text-[#98602a]" /> Manage locked dates</h2><p className="mt-1 text-xs text-muted-foreground sm:text-sm">Mark unavailable dates for planning across the CRM calendars.</p></div>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Close locked dates" disabled={busy} onClick={() => setOpen(false)}><X /></Button>
        </div>
        <div className="min-h-0 overflow-y-auto p-4 sm:p-6">
          {error ? <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
          {loadError ? <p role="alert" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">Locked dates could not be loaded. Try again before adding one.</p> : null}
          <form id="dashboard-lock-date-form" action={addDate} className="grid gap-3 rounded-xl border border-[#eadcc8] bg-[#fffbf5] p-3 dark:border-[#493822] dark:bg-[#241e17] sm:grid-cols-2 sm:p-4">
            <label className="grid gap-1.5 text-xs font-medium">Date *<input name="locked_date" type="date" required disabled={busy || loadError} className="h-10 min-w-0 rounded-lg border border-input bg-white px-3 text-sm dark:bg-card" /></label>
            <label className="grid gap-1.5 text-xs font-medium">Reason / label *<input name="label" type="text" required maxLength={100} placeholder="Holiday, private event…" disabled={busy || loadError} className="h-10 min-w-0 rounded-lg border border-input bg-white px-3 text-sm dark:bg-card" /></label>
            <label className="grid gap-1.5 text-xs font-medium sm:col-span-2">Notes (optional)<textarea name="notes" rows={2} maxLength={500} disabled={busy || loadError} className="min-h-16 w-full rounded-lg border border-input bg-white px-3 py-2 text-sm dark:bg-card" /></label>
            <Button type="submit" disabled={busy || loadError} className="sm:col-span-2 sm:justify-self-end"><Plus className="size-4" />{busy ? 'Saving…' : 'Lock date'}</Button>
          </form>
          <div className="mt-5"><h3 className="text-sm font-semibold">Upcoming locked dates <span className="text-muted-foreground">({dates.length})</span></h3>
            <div className="mt-2 divide-y divide-border overflow-hidden rounded-xl border border-border">
              {dates.length ? dates.map((entry) => <div key={entry.id} className="flex min-w-0 items-start gap-3 p-3 sm:items-center"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#f5ead8] text-[#70481c] dark:bg-[#33291c]"><LockKeyhole className="size-4" /></span><div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{entry.label}</p><p className="text-xs text-muted-foreground">{entry.locked_date}{entry.notes ? ` · ${entry.notes}` : ''}</p></div><Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${entry.label} on ${entry.locked_date}`} title="Remove locked date" disabled={busy} onClick={() => void removeDate(entry.id)}><Trash2 className="size-4 text-destructive" /></Button></div>) : <p className="p-4 text-sm text-muted-foreground">No upcoming locked dates.</p>}
            </div>
          </div>
        </div>
      </div>
    </div> : null}
  </>;
}
