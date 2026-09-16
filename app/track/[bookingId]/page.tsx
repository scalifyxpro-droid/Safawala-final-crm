import { notFound } from 'next/navigation';
import { Check, Circle, CalendarClock, MapPin } from 'lucide-react';
import { withServiceRole } from '@/lib/db/client';
import { friendlyDate } from '@/lib/bookings';
import { trackingTimeline, TRACKING_STAGE_LABEL } from '@/lib/event-jobs/constants';
import { getJobByBookingId } from '@/lib/event-jobs/store';

export const dynamic = 'force-dynamic';

type PublicBooking = {
  booking_number: string;
  status: string;
  event_name: string;
  event_date: string;
  event_location: string | null;
  customer_name: string;
};

// Fallback-only stages, used when no Central Event Job exists yet for this
// booking (e.g. it hasn't been confirmed, or the job hasn't synced) — keeps
// this page working even in that edge case, per the "never error" rule.
const FALLBACK_STAGES: { key: string; label: string }[] = [
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

  // Same live Central Event Job data the internal "Job Tracker" (Staff
  // Portal → Job Tracker) shows — this call is safe with no logged-in
  // session (service-role, self-healing) and reflects stage changes made
  // anywhere in the CRM the moment they happen, no separate sync needed.
  const job = cancelled ? null : await getJobByBookingId(bookingId).catch(() => null);
  const jobStages = job && Array.isArray(job.stages) ? trackingTimeline(job.stages, job.stylistExecutions) : null;

  return (
    <main className="min-h-screen bg-[#faf7f2] px-4 py-10">
      <div className="mx-auto max-w-md rounded-2xl border border-[#e7dcc8] bg-[#fffdf9] p-6 shadow-sm">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9a6728]">
          Job Tracker
        </p>
        <h1 className="mt-1 text-xl font-semibold text-neutral-900">{booking.customer_name}</h1>
        <p className="mt-0.5 text-sm text-neutral-500">
          {booking.booking_number} · {booking.event_name}
        </p>

        <div className="mt-3 space-y-1 text-xs text-neutral-500">
          <p className="flex items-center gap-1.5">
            <CalendarClock className="size-3.5" />
            Event date: {friendlyDate(booking.event_date)}
          </p>
          {job ? (
            <p className="text-xs text-neutral-500">Booking date: {friendlyDate(job.createdAt.slice(0, 10))}</p>
          ) : null}
          {booking.event_location ? (
            <p className="flex items-center gap-1.5">
              <MapPin className="size-3.5" />
              <span className="truncate">{booking.event_location}</span>
            </p>
          ) : null}
        </div>

        <div className="mt-6 border-t border-[#e7dcc8] pt-5">
          {cancelled ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
              This booking has been cancelled.
            </p>
          ) : jobStages ? (
            <ol>
              {jobStages.map((stage, index, orderedStages) => {
                const done = stage.status === 'done';
                const current = stage.status === 'open' || stage.status === 'in_progress';
                return (
                  <li key={stage.key} className="relative flex gap-3 pb-5 last:pb-0">
                    {index < orderedStages.length - 1 ? (
                      <span
                        aria-hidden="true"
                        className={`absolute left-[10px] top-5 h-full w-px ${done ? 'bg-emerald-300' : 'bg-[#e7dcc8]'}`}
                      />
                    ) : null}
                    <span
                      className={`relative z-10 mt-0.5 grid size-[21px] shrink-0 place-items-center rounded-full border ${
                        done
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                          : current
                            ? 'border-[#a86f2c] bg-[#f5ead8] text-[#70481c]'
                            : 'border-[#e7dcc8] bg-[#faf7f2] text-neutral-400'
                      }`}
                    >
                      {done ? <Check className="size-3" /> : <Circle className="size-2 fill-current" />}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-neutral-900">
                        {TRACKING_STAGE_LABEL[stage.key]}
                      </p>
                      <p
                        className={`mt-0.5 text-xs ${
                          done ? 'text-emerald-700' : current ? 'text-[#9a6124]' : 'text-neutral-400'
                        }`}
                      >
                        {done ? 'Completed' : current ? 'In progress' : 'Waiting'}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <ol className="space-y-4">
              {FALLBACK_STAGES.map((stage, index) => {
                const currentIndex = FALLBACK_STAGES.findIndex((s) => s.key === booking.status);
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
          Thank you for choosing Safawala, {booking.customer_name.split(' ')[0]}.
        </p>
      </div>
    </main>
  );
}
