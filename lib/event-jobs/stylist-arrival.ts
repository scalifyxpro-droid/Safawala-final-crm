import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { withServiceRole } from '@/lib/db/client';
import { assignedJobsForStylist, recordStylistExecution } from '@/lib/event-jobs/store';
import { sendWhatsAppText } from '@/lib/whatsapp/session';
import { stylistArrivalOtpMessage } from '@/lib/whatsapp/templates';

function digest(jobId: string, stylistId: string, salt: string, code: string) {
  const secret = process.env.AUTH_SECRET || process.env.DATABASE_URL;
  if (!secret) throw new Error('Server secret is not configured.');
  return createHmac('sha256', secret).update(`${jobId}:${stylistId}:${salt}:${code}`).digest('hex');
}

export async function sendStylistArrivalOtp(jobId: string, stylistId: string) {
  const job = (await assignedJobsForStylist(stylistId)).find((entry) => entry.id === jobId);
  if (!job) return { error: 'This event is not assigned to you.' };
  if (job.stylistExecutions.some((entry) => entry.stylistAccountId === stylistId && entry.status !== 'not_started')) {
    return { error: 'Arrival has already been verified.' };
  }
  const [customer] = await withServiceRole((tx) => tx<{
    phone: string | null;
    name: string | null;
    event_date: string | null;
    event_location: string | null;
  }[]>`
    select c.phone, c.name, b.event_date, b.event_location
    from public.bookings b
    left join public.customers c on c.id = b.customer_id
    where b.id = ${job.bookingId}
    limit 1
  `);
  const phone = customer?.phone?.replace(/\D/g, '') ?? '';
  if (phone.length < 10) return { error: 'Customer phone number is missing or invalid. Ask admin to update the booking.' };

  const code = String(randomInt(0, 10_000)).padStart(4, '0');
  const salt = randomBytes(16).toString('hex');
  const hash = digest(jobId, stylistId, salt, code);
  const issued = await withServiceRole((tx) => tx<{ job_id: string }[]>`
    insert into public.stylist_arrival_otp (job_id, stylist_account_id, code_hash, salt, expires_at, sent_at, attempts)
    values (${jobId}, ${stylistId}, ${hash}, ${salt}, now() + interval '5 minutes', now(), 0)
    on conflict (job_id, stylist_account_id) do update set
      code_hash = excluded.code_hash, salt = excluded.salt, expires_at = excluded.expires_at,
      sent_at = excluded.sent_at, attempts = 0
    where public.stylist_arrival_otp.sent_at <= now() - interval '60 seconds'
    returning job_id
  `);
  if (!issued.length) return { error: 'Please wait one minute before requesting another code.' };
  try {
    const message = stylistArrivalOtpMessage({
      customerName: customer?.name || 'Customer',
      bookingNumber: job.bookingNumber,
      eventDate: customer?.event_date ?? null,
      eventLocation: customer?.event_location ?? null,
      code,
    });
    await sendWhatsAppText(phone, message);
  } catch {
    await withServiceRole((tx) => tx`
      delete from public.stylist_arrival_otp where job_id = ${jobId} and stylist_account_id = ${stylistId} and code_hash = ${hash}
    `);
    return { error: 'WhatsApp could not deliver the code. Check the WhatsApp connection and try again.' };
  }
  return { success: true };
}

export async function verifyStylistArrivalOtp(jobId: string, stylistId: string, stylistName: string, code: string) {
  if (!/^\d{4}$/.test(code)) return { error: 'Enter the four digits sent to the customer.' };
  const job = (await assignedJobsForStylist(stylistId)).find((entry) => entry.id === jobId);
  if (!job) return { error: 'This event is not assigned to you.' };

  const [challenge] = await withServiceRole((tx) => tx<{ code_hash: string; salt: string }[]>`
    update public.stylist_arrival_otp set attempts = attempts + 1
    where job_id = ${jobId} and stylist_account_id = ${stylistId}
      and expires_at > now() and attempts < 5
    returning code_hash, salt
  `);
  if (!challenge) return { error: 'The code expired or too many attempts were made. Request a new code.' };
  const expected = Buffer.from(challenge.code_hash, 'hex');
  const submitted = Buffer.from(digest(jobId, stylistId, challenge.salt, code), 'hex');
  if (!timingSafeEqual(expected, submitted)) return { error: 'Incorrect code. Please try again.' };

  const result = await recordStylistExecution(jobId, stylistId, stylistName, 'reached_venue', 'Customer OTP verified at venue');
  if (result.error) return { error: result.error };
  await withServiceRole((tx) => tx`
    delete from public.stylist_arrival_otp where job_id = ${jobId} and stylist_account_id = ${stylistId}
  `);
  return { success: true };
}
