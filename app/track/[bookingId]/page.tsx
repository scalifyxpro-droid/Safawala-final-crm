import { notFound } from 'next/navigation';
import { withServiceRole } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

type PublicBooking = {
  booking_number: string;
  status: string;
  event_name: string;
  event_date: string;
  event_location: string | null;
  customer_name: string;
};

const STAGES: { key: string; label: string }[] = [
  { key: 'confirmed', label: 'Booking Confirmed' },
  { key: 'ready', label: 'Items Ready' },
  { key: 'out_for_delivery', label: 'On the Way' },
  { key: 'active', label: 'Event Day' },
  { key: 'completed', label: 'Completed' },
];

async function fetchPublicBooking(bookingId: number): Promise<PublicBooking | null> {
  const [row] = await withServiceRole((tx) =>
    tx.unsafe(
      `
        select b.booking_number, b.status, b.event_name, b.event_date, b.event_location,
          c.name as customer_name
        from public.bookings b
        join public.customers c on c.id = b.customer_id
        where b.id = $1
      `,
      [bookingId],
    ),
  );
  return (row as unknown as PublicBooking) ?? null;
}

function formatDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
}

export default async function PublicTrackingPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId: bookingIdParam } = await params;
  const bookingId = Number(bookingIdParam);
  if (!Number.isFinite(bookingId)) notFound();

  const booking = await fetchPublicBooking(bookingId);
  if (!booking) notFound();

  const cancelled = booking.status === 'cancelled';
  const currentIndex = STAGES.findIndex((s) => s.key === booking.status);

  return (
    <main className="min-h-screen bg-[#faf7f2] px-4 py-10">
      <div className="mx-auto max-w-md rounded-2xl border border-[#e7dcc8] bg-white p-6 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-[#9a6728]">SafaWala</p>
        <h1 className="mt-1 text-xl font-semibold text-neutral-900">{booking.event_name}</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Booking {booking.booking_number} · {formatDate(booking.event_date)}
          {booking.event_location ? ` · ${booking.event_location}` : ''}
        </p>

        <div className="mt-6">
          {cancelled ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
              This booking has been cancelled.
            </p>
          ) : (
            <ol className="space-y-4">
              {STAGES.map((stage, index) => {
                const done = currentIndex >= 0 && index <= currentIndex;
                const isCurrent = index === currentIndex;
                return (
                  <li key={stage.key} className="flex items-center gap-3">
                    <span
                      className={
                        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ' +
                        (done ? 'bg-[#9a6728] text-white' : 'bg-neutral-100 text-neutral-400')
                      }
                    >
                      {done ? '✓' : index + 1}
                    </span>
                    <span
                      className={
                        'text-sm ' +
                        (isCurrent
                          ? 'font-semibold text-neutral-900'
                          : done
                            ? 'text-neutral-700'
                            : 'text-neutral-400')
                      }
                    >
                      {stage.label}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <p className="mt-8 text-center text-xs text-neutral-400">
          Thank you for choosing SafaWala, {booking.customer_name.split(' ')[0]}.
        </p>
      </div>
    </main>
  );
}
