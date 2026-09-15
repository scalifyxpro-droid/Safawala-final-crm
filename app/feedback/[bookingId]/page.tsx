import { notFound } from 'next/navigation';
import { withServiceRole } from '@/lib/db/client';
import { FeedbackForm } from '@/components/public/feedback-form';

export const dynamic = 'force-dynamic';

async function fetchBookingSummary(bookingId: number) {
  const [row] = await withServiceRole((tx) =>
    tx.unsafe(
      `
        select b.booking_number, b.event_name, c.name as customer_name
        from public.bookings b
        join public.customers c on c.id = b.customer_id
        where b.id = $1
      `,
      [bookingId],
    ),
  );
  return (row as unknown as { booking_number: string; event_name: string; customer_name: string } | undefined) ?? null;
}

export default async function PublicFeedbackPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId: bookingIdParam } = await params;
  const bookingId = Number(bookingIdParam);
  if (!Number.isFinite(bookingId)) notFound();

  const booking = await fetchBookingSummary(bookingId);
  if (!booking) notFound();

  return (
    <main className="min-h-screen bg-[#faf7f2] px-4 py-10">
      <div className="mx-auto max-w-md rounded-2xl border border-[#e7dcc8] bg-white p-6 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-[#9a6728]">SafaWala</p>
        <h1 className="mt-1 text-xl font-semibold text-neutral-900">Share your feedback</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {booking.event_name} · Booking {booking.booking_number}
        </p>
        <FeedbackForm bookingId={bookingId} />
      </div>
    </main>
  );
}
