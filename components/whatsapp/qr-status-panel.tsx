'use client';

import { useEffect, useState } from 'react';

type Status = {
  status: 'DISCONNECTED' | 'CONNECTING' | 'PENDING_QR' | 'CONNECTED';
  qrDataUrl: string | null;
  phoneNumber: string | null;
  lastError: string | null;
};

const LABEL: Record<Status['status'], string> = {
  DISCONNECTED: 'Disconnected',
  CONNECTING: 'Connecting…',
  PENDING_QR: 'Scan the QR code below with WhatsApp',
  CONNECTED: 'Connected',
};

export function WhatsAppQrStatusPanel() {
  const [data, setData] = useState<Status | null>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch('/api/whatsapp-qr-status', { cache: 'no-store' });
        if (!res.ok) return;
        const json = (await res.json()) as Status;
        if (!cancelled) setData(json);
      } catch {
        // Network hiccup — the next poll will pick it back up.
      }
    };
    poll();
    const interval = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-6">
      <div className="flex items-center gap-2">
        <span
          className={
            'inline-block h-2.5 w-2.5 rounded-full ' +
            (data?.status === 'CONNECTED'
              ? 'bg-green-500'
              : data?.status === 'PENDING_QR'
                ? 'bg-amber-500'
                : 'bg-neutral-300')
          }
        />
        <p className="text-sm font-medium text-neutral-800">
          {data ? LABEL[data.status] : 'Checking status…'}
        </p>
      </div>

      {data?.status === 'CONNECTED' && data.phoneNumber ? (
        <p className="mt-2 text-sm text-neutral-500">
          Sending messages from <span className="font-medium text-neutral-800">+{data.phoneNumber}</span>
        </p>
      ) : null}

      {data?.status === 'PENDING_QR' && data.qrDataUrl ? (
        <div className="mt-4 flex flex-col items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={data.qrDataUrl} alt="WhatsApp login QR code" className="h-64 w-64" />
          <p className="max-w-xs text-center text-xs text-neutral-500">
            Open WhatsApp on +91 9033014432 → Settings → Linked Devices → Link a Device, then scan
            this code.
          </p>
        </div>
      ) : null}

      {data?.lastError ? <p className="mt-3 text-sm text-red-600">{data.lastError}</p> : null}
    </div>
  );
}
