import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { withServiceRole } from '@/lib/db/client';
import { getStaffSession } from '@/lib/staff-portal/session';

export const dynamic = 'force-dynamic';

type ChatActor = {
  ownerId: string;
  key: string;
  name: string;
  email: string;
};

async function resolveActor(): Promise<ChatActor | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const staff = await getStaffSession();
  if (staff) {
    const rows = await withServiceRole((tx) => tx<{ owner_id: string; login_id: string | null }[]>`
      select owner_id, login_id
      from public.staff_members
      where id = ${staff.staffMemberId} and user_id = ${user.id}
      limit 1
    `);
    const account = rows[0];
    if (!account) return null;
    return {
      ownerId: account.owner_id,
      key: `staff:${staff.staffMemberId}`,
      name: staff.name,
      email: account.login_id ?? user.email,
    };
  }

  if (user.role !== 'admin') return null;
  const profiles = await withServiceRole((tx) => tx<{ full_name: string | null }[]>`
    select full_name from public.profiles where id = ${user.id} limit 1
  `);
  return {
    ownerId: user.id,
    key: `admin:${user.id}`,
    name: profiles[0]?.full_name?.trim() || 'Safawala Admin',
    email: user.email,
  };
}

function failure(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  const actor = await resolveActor();
  if (!actor) return failure('Unauthorized.', 401);

  try {
    const payload = await withServiceRole(async (tx) => {
      const [staffRows, messageRows, readRows, presenceRows] = await Promise.all([
        tx<{
          id: number;
          name: string;
          login_id: string | null;
          staff_type: string;
          portal_kind: string;
        }[]>`
          select id, name, login_id, staff_type, portal_kind
          from public.staff_members
          where owner_id = ${actor.ownerId}
            and is_active = true
            and portal_active = true
          order by lower(name), id
        `,
        tx<{
          id: number;
          channel_type: 'everyone' | 'direct';
          sender_key: string;
          sender_name: string;
          recipient_key: string | null;
          body: string;
          created_at: Date;
        }[]>`
          select id, channel_type, sender_key, sender_name, recipient_key, body, created_at
          from (
            select id, channel_type, sender_key, sender_name, recipient_key, body, created_at
            from public.team_chat_messages
            where owner_id = ${actor.ownerId}
              and deleted_at is null
              and (
                channel_type = 'everyone'
                or sender_key = ${actor.key}
                or recipient_key = ${actor.key}
              )
            order by created_at desc, id desc
            limit 500
          ) recent_messages
          order by created_at asc, id asc
        `,
        tx<{ channel_key: string; last_read_message_id: number }[]>`
          select channel_key, last_read_message_id
          from public.team_chat_reads
          where owner_id = ${actor.ownerId} and reader_key = ${actor.key}
        `,
        tx<{ member_key: string; last_seen_at: Date }[]>`
          select member_key, last_seen_at
          from public.team_chat_presence
          where owner_id = ${actor.ownerId}
        `,
      ]);

      await tx`
        insert into public.team_chat_presence (owner_id, member_key, last_seen_at)
        values (${actor.ownerId}, ${actor.key}, now())
        on conflict (owner_id, member_key)
        do update set last_seen_at = excluded.last_seen_at
      `;

      const onlineCutoff = Date.now() - 2 * 60 * 1000;
      const presence = new Map(
        presenceRows.map((row) => [row.member_key, new Date(row.last_seen_at).getTime()]),
      );
      const members = [
        {
          key: `admin:${actor.ownerId}`,
          name: actor.key === `admin:${actor.ownerId}` ? actor.name : 'Safawala Admin',
          email: actor.key === `admin:${actor.ownerId}` ? actor.email : '',
          role: 'Admin',
          online: actor.key === `admin:${actor.ownerId}` ||
            (presence.get(`admin:${actor.ownerId}`) ?? 0) >= onlineCutoff,
        },
        ...staffRows.map((row) => ({
          key: `staff:${row.id}`,
          name: row.name,
          email: row.login_id ?? '',
          role: row.staff_type === 'stylist'
            ? 'Stylist'
            : row.portal_kind === 'accounts'
              ? 'Accounts'
              : row.portal_kind === 'manager'
                ? 'Manager'
                : 'Staff',
          online: actor.key === `staff:${row.id}` ||
            (presence.get(`staff:${row.id}`) ?? 0) >= onlineCutoff,
        })),
      ];

      return {
        actor: { key: actor.key, name: actor.name },
        members,
        messages: messageRows.map((row) => ({
          id: Number(row.id),
          channelType: row.channel_type,
          senderKey: row.sender_key,
          senderName: row.sender_name,
          recipientKey: row.recipient_key,
          body: row.body,
          createdAt: new Date(row.created_at).toISOString(),
        })),
        reads: Object.fromEntries(
          readRows.map((row) => [row.channel_key, Number(row.last_read_message_id)]),
        ),
      };
    });

    return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Team chat load failed:', error);
    return failure('Team chat is temporarily unavailable.', 503);
  }
}

export async function POST(request: NextRequest) {
  const actor = await resolveActor();
  if (!actor) return failure('Unauthorized.', 401);

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return failure('Invalid request.', 400);
  }
  const data = input as Record<string, unknown>;

  try {
    if (data.action === 'presence') {
      await withServiceRole((tx) => tx`
        insert into public.team_chat_presence (owner_id, member_key, last_seen_at)
        values (${actor.ownerId}, ${actor.key}, now())
        on conflict (owner_id, member_key)
        do update set last_seen_at = excluded.last_seen_at
      `);
      return NextResponse.json({ ok: true });
    }

    if (data.action === 'read') {
      const channelKey = typeof data.channelKey === 'string' ? data.channelKey : '';
      const lastMessageId = Number(data.lastMessageId);
      if ((!channelKey.startsWith('direct:') && channelKey !== 'everyone') || !Number.isFinite(lastMessageId)) {
        return failure('Invalid read marker.', 400);
      }
      await withServiceRole((tx) => tx`
        insert into public.team_chat_reads
          (owner_id, reader_key, channel_key, last_read_message_id, updated_at)
        values (${actor.ownerId}, ${actor.key}, ${channelKey}, ${lastMessageId}, now())
        on conflict (owner_id, reader_key, channel_key)
        do update set
          last_read_message_id = greatest(
            public.team_chat_reads.last_read_message_id,
            excluded.last_read_message_id
          ),
          updated_at = now()
      `);
      return NextResponse.json({ ok: true });
    }

    if (data.action === 'delete') {
      const messageId = Number(data.messageId);
      if (!Number.isFinite(messageId)) return failure('Invalid message.', 400);
      await withServiceRole((tx) => tx`
        update public.team_chat_messages
        set deleted_at = now()
        where id = ${messageId}
          and owner_id = ${actor.ownerId}
          and sender_key = ${actor.key}
      `);
      return NextResponse.json({ ok: true });
    }

    if (data.action !== 'send') return failure('Unknown action.', 400);
    const body = typeof data.body === 'string' ? data.body.trim() : '';
    const recipientKey = typeof data.recipientKey === 'string' ? data.recipientKey : null;
    if (!body || body.length > 2000) return failure('Message must be 1–2000 characters.', 400);

    if (recipientKey) {
      if (recipientKey === actor.key) return failure('Choose another team member.', 400);
      const valid = await withServiceRole(async (tx) => {
        if (recipientKey === `admin:${actor.ownerId}`) return true;
        if (!recipientKey.startsWith('staff:')) return false;
        const staffId = Number(recipientKey.slice(6));
        if (!Number.isFinite(staffId)) return false;
        const rows = await tx<{ exists: boolean }[]>`
          select exists(
            select 1 from public.staff_members
            where id = ${staffId}
              and owner_id = ${actor.ownerId}
              and is_active = true
              and portal_active = true
          ) as exists
        `;
        return rows[0]?.exists === true;
      });
      if (!valid) return failure('Team member not found.', 404);
    }

    const rows = await withServiceRole((tx) => tx<{ id: number; created_at: Date }[]>`
      insert into public.team_chat_messages
        (owner_id, channel_type, sender_key, sender_name, recipient_key, body)
      values (
        ${actor.ownerId},
        ${recipientKey ? 'direct' : 'everyone'},
        ${actor.key},
        ${actor.name},
        ${recipientKey},
        ${body}
      )
      returning id, created_at
    `);
    return NextResponse.json({
      ok: true,
      id: Number(rows[0]?.id),
      createdAt: rows[0]?.created_at?.toISOString(),
    });
  } catch (error) {
    console.error('Team chat action failed:', error);
    return failure('Team chat action could not be completed.', 503);
  }
}
