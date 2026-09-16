'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { recordExecutionAction, requestArrivalOtpAction, verifyArrivalOtpAction } from '@/app/staff-portal/stylist/execution-actions';
import type { StylistExecutionStatus } from '@/lib/event-jobs/types';

export function StylistExecutionControl({ jobId, status }: { jobId: string; status: StylistExecutionStatus }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  if (status === 'work_completed') return null;
  function send() {
    setError('');
    setOpen(true);
    startTransition(async () => {
      try {
        const result = await requestArrivalOtpAction(jobId);
        if (result.error) setError(result.error);
        else setSent(true);
      } catch { setError('Unable to send the code. Please try again.'); }
    });
  }
  function verify() {
    setError('');
    startTransition(async () => {
      try {
        const result = await verifyArrivalOtpAction(jobId, code);
        if (result.error) setError(result.error);
        else { setOpen(false); router.refresh(); }
      } catch { setError('Unable to verify the code. Please try again.'); }
    });
  }
  function finish() {
    setError('');
    startTransition(async () => {
      const data = new FormData();
      data.set('jobId', jobId);
      data.set('action', 'complete_work');
      try {
        const result = await recordExecutionAction(data);
        if (result?.error) setError(result.error);
        else router.refresh();
      } catch { setError('Unable to complete the work. Please try again.'); }
    });
  }

  return <>
    <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:items-end">
      {status === 'not_started' ? <Button size="sm" disabled={pending} onClick={send}>Reached Venue</Button> : <Button size="sm" disabled={pending} onClick={finish}>Work Done</Button>}
      {error && !open ? <p role="alert" className="max-w-72 text-xs text-red-700">{error}</p> : null}
    </div>
    {open ? <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div role="dialog" aria-modal="true" aria-labelledby={`arrival-title-${jobId}`} className="w-full max-w-sm rounded-2xl border border-[#dfd3c3] bg-[#fcfaf7] p-5 shadow-2xl dark:bg-card sm:p-6">
        <h2 id={`arrival-title-${jobId}`} className="text-lg font-semibold">Verify venue arrival</h2>
        <p className="mt-2 text-sm text-muted-foreground">{sent ? 'Ask the customer for the four-digit code sent to their WhatsApp. The event goes live after verification.' : 'Sending a four-digit code to the customer’s WhatsApp…'}</p>
        {sent ? <><label htmlFor={`arrival-code-${jobId}`} className="mt-5 block text-sm font-medium">Customer code</label><input id={`arrival-code-${jobId}`} autoFocus inputMode="numeric" pattern="[0-9]*" maxLength={4} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 4))} className="mt-1 h-11 w-full rounded-lg border border-[#dfd3c3] bg-white px-3 text-center text-xl tracking-[0.5em] outline-none focus:border-primary dark:bg-background" /></> : null}
        {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
        <div className="mt-5 flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>{sent ? <><Button variant="outline" disabled={pending} onClick={send}>Resend</Button><Button disabled={pending || code.length !== 4} onClick={verify}>Verify OTP</Button></> : <Button disabled={pending} onClick={send}>Try again</Button>}</div>
      </div>
    </div> : null}
  </>;
}
