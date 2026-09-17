/**
 * Runs once when the Next.js server process starts (Railway runs this app
 * as a persistent `next start` server, not per-request serverless, so this
 * fires exactly once per deploy/restart). Used to bring the WhatsApp
 * automation's Baileys connection up automatically, reusing any credentials
 * already saved in Postgres so a redeploy doesn't ask to re-scan the QR code,
 * and to keep the 7-day / 1-day event reminder check running in the
 * background for the life of the process.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Railway runs the persistent WhatsApp worker in production. Starting it
    // automatically in local development makes an expired/missing Railway DB
    // tunnel surface as a Next.js runtime overlay before the login page can
    // render. The QR status endpoint can still start the session on demand.
    const autoStartWhatsApp =
      process.env.NODE_ENV === 'production' || process.env.WHATSAPP_AUTO_START === 'true';
    if (!autoStartWhatsApp) return;

    const { startWhatsAppSession } = await import('@/lib/whatsapp/session');
    startWhatsAppSession().catch((err) => {
      console.error('[whatsapp] failed to start session on boot', err);
    });

    const { checkAndSendEventReminders } = await import('@/lib/whatsapp/notify');
    const REMINDER_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours
    // A short delay lets the WhatsApp connection and DB pool finish coming
    // up first, then the check repeats for the life of this process. It is
    // safe to run more than once a day — public.whatsapp_messages ensures
    // each reminder is only ever actually sent once per booking.
    setTimeout(() => {
      checkAndSendEventReminders().catch((err) =>
        console.error('[whatsapp] event reminder check failed on boot', err),
      );
      setInterval(() => {
        checkAndSendEventReminders().catch((err) =>
          console.error('[whatsapp] periodic event reminder check failed', err),
        );
      }, REMINDER_CHECK_INTERVAL_MS);
    }, 60_000);
  }
}
