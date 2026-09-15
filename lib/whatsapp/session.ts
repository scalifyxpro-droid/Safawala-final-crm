import makeWASocket, {
  DisconnectReason,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
  initAuthCreds,
  BufferJSON,
  type WASocket,
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import pino from 'pino';
import { withServiceRole } from '@/lib/db/client';

/**
 * Single WhatsApp connection for the whole app, kept alive for the life of
 * this Node process (this app runs as a persistent `next start` server on
 * Railway, not a per-request serverless function, so a module-level
 * singleton survives across requests exactly like the Postgres pool in
 * lib/db/client.ts does).
 *
 * Login credentials are persisted to Postgres (public.whatsapp_auth_state)
 * instead of the local filesystem, so a redeploy/restart reconnects
 * automatically without asking to re-scan the QR code.
 *
 * This is an unofficial connection (Baileys, not the WhatsApp Business
 * Cloud API) — approved and requested by the business owner. Every send
 * goes through sendWhatsAppText(), which never throws to its caller; a
 * failure here must never be able to break booking/payment/invoice flows.
 */

const SESSION_ID = 'main';
const logger = pino({ level: 'warn' });
// If WhatsApp never responds with a QR or an open connection within this
// window, something (most often outbound network policy) is silently
// blocking the handshake. Surface that as a clear error instead of leaving
// the admin staring at "Connecting..." forever.
const CONNECT_TIMEOUT_MS = 30_000;

type SessionStatus = 'DISCONNECTED' | 'CONNECTING' | 'PENDING_QR' | 'CONNECTED';

type SessionState = {
  sock: WASocket | null;
  qrDataUrl: string | null;
  status: SessionStatus;
  phoneNumber: string | null;
  lastError: string | null;
};

declare global {
  // eslint-disable-next-line no-var
  var __waSession: SessionState | undefined;
  // eslint-disable-next-line no-var
  var __waStarting: Promise<void> | undefined;
}

function state(): SessionState {
  if (!globalThis.__waSession) {
    globalThis.__waSession = {
      sock: null,
      qrDataUrl: null,
      status: 'DISCONNECTED',
      phoneNumber: null,
      lastError: null,
    };
  }
  return globalThis.__waSession;
}

async function loadAuthState() {
  const [row] = await withServiceRole((tx) =>
    tx`select creds, keys from public.whatsapp_auth_state where id = ${SESSION_ID}`,
  );

  const creds = row?.creds
    ? JSON.parse(JSON.stringify(row.creds), BufferJSON.reviver)
    : initAuthCreds();
  const keys: Record<string, Record<string, unknown>> = row?.keys
    ? JSON.parse(JSON.stringify(row.keys), BufferJSON.reviver)
    : {};

  const persist = async () => {
    const serializedCreds = JSON.parse(JSON.stringify(creds, BufferJSON.replacer));
    const serializedKeys = JSON.parse(JSON.stringify(keys, BufferJSON.replacer));
    await withServiceRole(
      (tx) => tx`
        insert into public.whatsapp_auth_state (id, creds, keys, updated_at)
        values (${SESSION_ID}, ${tx.json(serializedCreds)}, ${tx.json(serializedKeys)}, now())
        on conflict (id) do update set
          creds = excluded.creds,
          keys = excluded.keys,
          updated_at = now()
      `,
    ).catch((err) => {
      // Persisting auth state failing must never crash the socket — worst
      // case a future restart re-asks for the QR code.
      console.error('[whatsapp] failed to persist auth state', err);
    });
  };

  return { creds, keys, persist };
}

/** Starts (or reconnects) the WhatsApp socket. Safe to call more than once. */
export async function startWhatsAppSession(): Promise<void> {
  const s = state();
  // PENDING_QR must also short-circuit here: once a QR is showing, repeated
  // calls (the admin page polls every few seconds) must NOT tear the socket
  // down and mint a fresh QR each time — that made the code change faster
  // than anyone could scan it. Only DISCONNECTED (never started, timed out,
  // or explicitly closed) should start a new attempt.
  if (s.status === 'CONNECTED' || s.status === 'CONNECTING' || s.status === 'PENDING_QR') return;
  if (globalThis.__waStarting) return globalThis.__waStarting;

  globalThis.__waStarting = (async () => {
    let connectTimer: ReturnType<typeof setTimeout> | null = null;
    try {
      s.status = 'CONNECTING';
      s.lastError = null;
      console.log('[whatsapp] starting session...');
      const { creds, keys, persist } = await loadAuthState();
      const { version } = await fetchLatestBaileysVersion();
      console.log('[whatsapp] using baileys version', version);

      const sock = makeWASocket({
        version,
        auth: {
          creds,
          keys: makeCacheableSignalKeyStore(
            {
              get: async (type: string, ids: string[]) => {
                const result: Record<string, any> = {};
                for (const id of ids) {
                  const value = keys[type]?.[id];
                  if (value !== undefined) result[id] = value;
                }
                return result;
              },
              set: async (data: Record<string, Record<string, unknown>>) => {
                for (const type of Object.keys(data)) {
                  keys[type] = keys[type] || {};
                  Object.assign(keys[type], data[type]);
                }
                await persist();
              },
            },
            logger as never,
          ),
        },
        logger: logger as never,
        printQRInTerminal: false,
        syncFullHistory: false,
      });

      s.sock = sock;
      sock.ev.on('creds.update', persist);

      const clearConnectTimer = () => {
        if (connectTimer) {
          clearTimeout(connectTimer);
          connectTimer = null;
        }
      };

      connectTimer = setTimeout(() => {
        if (state().status === 'CONNECTING') {
          console.error(
            '[whatsapp] connection timed out waiting for QR/open — likely blocked outbound network',
          );
          state().status = 'DISCONNECTED';
          state().lastError =
            'Could not reach WhatsApp servers (timed out). This can happen if the hosting network blocks the connection. Try again in a moment.';
          state().sock = null;
          try {
            sock.end(new Error('connect timeout'));
          } catch {
            // best-effort cleanup
          }
        }
      }, CONNECT_TIMEOUT_MS);

      sock.ev.on(
        'connection.update',
        (update: { connection?: string; lastDisconnect?: { error?: unknown }; qr?: string }) => {
          const { connection, lastDisconnect, qr } = update;
          console.log('[whatsapp] connection.update', { connection, hasQr: Boolean(qr) });

          if (qr) {
            clearConnectTimer();
            QRCode.toDataURL(qr)
              .then((url) => {
                state().qrDataUrl = url;
                state().status = 'PENDING_QR';
              })
              .catch((err) => console.error('[whatsapp] failed to render QR', err));
          }

          if (connection === 'open') {
            clearConnectTimer();
            state().status = 'CONNECTED';
            state().qrDataUrl = null;
            state().lastError = null;
            state().phoneNumber = sock.user?.id?.split(':')[0] ?? null;
            console.log('[whatsapp] connected', state().phoneNumber);
          }

          if (connection === 'close') {
            clearConnectTimer();
            const statusCode = (
              lastDisconnect?.error as { output?: { statusCode?: number } | undefined
            )?.output?.statusCode;
            const loggedOut = statusCode === DisconnectReason.loggedOut;

            state().status = 'DISCONNECTED';
            state().sock = null;
            state().lastError = loggedOut
              ? 'Logged out from the phone — scan the QR code again.'
              : 'Disconnected — reconnecting automatically.';

            if (loggedOut) {
              // Clear the stale credentials so the next start issues a fresh QR
              // instead of looping on rejected creds.
              withServiceRole(
                (tx) => tx`delete from public.whatsapp_auth_state where id = ${SESSION_ID}`,
              ).catch((err) => console.error('[whatsapp] failed to clear auth state', err));
            } else {
              setTimeout(() => {
                startWhatsAppSession().catch((err) =>
                  console.error('[whatsapp] reconnect failed', err),
                );
              }, 4000);
            }
          }
        },
      );
    } catch (err) {
      s.status = 'DISCONNECTED';
      s.lastError = err instanceof Error ? err.message : 'Failed to start WhatsApp session.';
      console.error('[whatsapp] failed to start session', err);
    } finally {
      globalThis.__waStarting = undefined;
    }
  })();

  return globalThis.__waStarting;
}

export function getSessionStatus() {
  const s = state();
  return {
    status: s.status,
    qrDataUrl: s.qrDataUrl,
    phoneNumber: s.phoneNumber,
    lastError: s.lastError,
  };
}

/** Accepts a 10-digit Indian mobile number, or one already carrying a country code. */
function toWhatsAppJid(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  let national = digits;
  if (national.length === 11 && national.startsWith('0')) national = national.slice(1);
  const withCountryCode = national.length === 10 ? `91${national}` : national;
  return `${withCountryCode}@s.whatsapp.net`;
}

/**
 * Sends a plain-text WhatsApp message. Throws on failure — callers in
 * lib/whatsapp/notify.ts always wrap this so a delivery failure is logged,
 * never allowed to break the CRM action that triggered it.
 */
export async function sendWhatsAppText(phone: string, text: string) {
  const s = state();
  if (!s.sock || s.status !== 'CONNECTED') {
    throw new Error('WhatsApp is not connected. Open /whatsapp-qr and scan the QR code.');
  }
  return s.sock.sendMessage(toWhatsAppJid(phone), { text });
}

/**
 * Sends a document (used for the invoice PDF) with an optional caption.
 * Same never-throws-to-nothing contract as sendWhatsAppText — callers in
 * lib/whatsapp/notify.ts always wrap this so a delivery failure is logged,
 * never allowed to break the CRM action that triggered it.
 */
export async function sendWhatsAppDocument(
  phone: string,
  document: Buffer,
  fileName: string,
  caption?: string,
) {
  const s = state();
  if (!s.sock || s.status !== 'CONNECTED') {
    throw new Error('WhatsApp is not connected. Open /whatsapp-qr and scan the QR code.');
  }
  return s.sock.sendMessage(toWhatsAppJid(phone), {
    document,
    fileName,
    mimetype: 'application/pdf',
    caption,
  });
}
