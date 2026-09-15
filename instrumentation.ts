/**
 * Runs once when the Next.js server process starts (Railway runs this app
 * as a persistent `next start` server, not per-request serverless, so this
 * fires exactly once per deploy/restart). Used to bring the WhatsApp
 * automation's Baileys connection up automatically, reusing any credentials
 * already saved in Postgres so a redeploy doesn't ask to re-scan the QR code.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startWhatsAppSession } = await import('@/lib/whatsapp/session');
    startWhatsAppSession().catch((err) => {
      console.error('[whatsapp] failed to start session on boot', err);
    });
  }
}
