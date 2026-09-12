import 'server-only';

import { withServiceRole } from '@/lib/db/client';
import type { StaffDepartment } from '@/lib/staff-portal/constants';

export type EventJobNotification = {
  id: string;
  jobId: string;
  recipientDepartment: StaffDepartment | null;
  recipientAccountId: string | null;
  message: string;
  createdAt: string;
  readAt: string | null;
};

type Row = {
  id: string;
  event_job_id: string;
  recipient_department: StaffDepartment | null;
  recipient_account_id: string | null;
  message: string;
  created_at: string;
  read_at: string | null;
};

function toNotification(item: Row): EventJobNotification {
  return {
    id: item.id,
    jobId: item.event_job_id,
    recipientDepartment: item.recipient_department,
    recipientAccountId: item.recipient_account_id,
    message: item.message,
    createdAt: item.created_at,
    readAt: item.read_at,
  };
}

async function notify(jobId: string, message: string, target: { department: StaffDepartment } | { accountId: string }) {
  const department = 'department' in target ? target.department : null;
  const accountId = 'accountId' in target ? target.accountId : null;
  await withServiceRole((tx) => tx`
    insert into public.event_job_notifications (event_job_id, recipient_department, recipient_account_id, message)
    values (${jobId}, ${department}, ${accountId}, ${message})
  `);
}

export async function notifyDepartment(jobId: string, department: StaffDepartment, message: string) {
  await notify(jobId, message, { department });
}

export async function notifyAccount(jobId: string, accountId: string, message: string) {
  await notify(jobId, message, { accountId });
}

// Everything addressed to one of the caller's active departments, OR to their account
// directly — never notifications for a department they don't (or no longer) hold.
export async function notificationsForSession(accountId: string, activeDepartments: StaffDepartment[]): Promise<EventJobNotification[]> {
  const rows = await withServiceRole((tx) =>
    activeDepartments.length
      ? tx<Row[]>`
          select * from public.event_job_notifications
          where recipient_account_id = ${accountId} or recipient_department = any(${tx.array(activeDepartments)})
          order by created_at desc
        `
      : tx<Row[]>`
          select * from public.event_job_notifications
          where recipient_account_id = ${accountId}
          order by created_at desc
        `
  );
  return rows.map(toNotification);
}

export async function unreadCountForSession(accountId: string, activeDepartments: StaffDepartment[]): Promise<number> {
  return (await notificationsForSession(accountId, activeDepartments)).filter((item) => item.readAt === null).length;
}

export async function markAllReadForSession(accountId: string, activeDepartments: StaffDepartment[]) {
  const mine = await notificationsForSession(accountId, activeDepartments);
  const ids = mine.filter((item) => !item.readAt).map((item) => item.id);
  if (!ids.length) return;
  await withServiceRole((tx) => tx`update public.event_job_notifications set read_at = now() where id = any(${tx.array(ids)})`);
}
