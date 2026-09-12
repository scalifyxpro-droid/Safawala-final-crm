'use server';

import { requireUser } from '@/lib/auth/session';
import { withUserContext, type DbParameter } from '@/lib/db/client';
import { getSignedFileUrl, uploadFile } from '@/lib/storage/client';

const STAFF_KYC_BUCKET = 'staff-kyc';

export type SaveAttendanceInput = {
  id?: number;
  staff_id: number;
  attendance_date: string;
  status: string;
  check_in: string | null;
  check_out: string | null;
  working_hours: number;
  overtime: number;
};

export async function saveAttendanceAction(input: SaveAttendanceInput): Promise<{ error: string }> {
  try {
    const user = await requireUser();
    await withUserContext(user.id, (tx) =>
      input.id
        ? tx`
            update public.hr_attendance
            set staff_id = ${input.staff_id}, attendance_date = ${input.attendance_date}, status = ${input.status},
              check_in = ${input.check_in}, check_out = ${input.check_out},
              working_hours = ${input.working_hours}, overtime = ${input.overtime}
            where id = ${input.id}
          `
        : tx`
            insert into public.hr_attendance (owner_id, staff_id, attendance_date, status, check_in, check_out, working_hours, overtime)
            values (${user.id}, ${input.staff_id}, ${input.attendance_date}, ${input.status}, ${input.check_in}, ${input.check_out}, ${input.working_hours}, ${input.overtime})
          `,
    );
    return { error: '' };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Attendance record could not be saved.' };
  }
}

export type SavePayrollInput = {
  id?: number;
  staff_id: number;
  period: string;
  base_salary: number;
  allowances: number;
  deductions: number;
  advances: number;
  status: string;
};

export async function savePayrollAction(input: SavePayrollInput): Promise<{ error: string }> {
  try {
    const user = await requireUser();
    await withUserContext(user.id, (tx) =>
      input.id
        ? tx`
            update public.hr_payroll
            set staff_id = ${input.staff_id}, period = ${input.period}, base_salary = ${input.base_salary},
              allowances = ${input.allowances}, deductions = ${input.deductions}, advances = ${input.advances},
              status = ${input.status}
            where id = ${input.id}
          `
        : tx`
            insert into public.hr_payroll (owner_id, staff_id, period, base_salary, allowances, deductions, advances, status)
            values (${user.id}, ${input.staff_id}, ${input.period}, ${input.base_salary}, ${input.allowances}, ${input.deductions}, ${input.advances}, ${input.status})
            on conflict (owner_id, staff_id, period) do update set
              base_salary = excluded.base_salary, allowances = excluded.allowances,
              deductions = excluded.deductions, advances = excluded.advances, status = excluded.status
          `,
    );
    return { error: '' };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Payroll record could not be saved.' };
  }
}

export type SaveLetterInput = {
  staff_id: number;
  letter_type: string;
  title: string;
  issued_on: string;
  notes: string;
};

export async function saveLetterAction(input: SaveLetterInput): Promise<{ error: string }> {
  try {
    const user = await requireUser();
    await withUserContext(user.id, (tx) => tx`
      insert into public.hr_letters (owner_id, staff_id, letter_type, title, issued_on, notes)
      values (${user.id}, ${input.staff_id}, ${input.letter_type}, ${input.title}, ${input.issued_on}, ${input.notes})
    `);
    return { error: '' };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Letter could not be saved.' };
  }
}

export async function saveKycDocumentAction(formData: FormData): Promise<{ error: string }> {
  try {
    const user = await requireUser();
    const text = (key: string) => {
      const value = formData.get(key);
      return typeof value === 'string' ? value.trim() : '';
    };
    const file = formData.get('document');

    let documentUrl: string | null = null;
    if (file instanceof File && file.size > 0) {
      try {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
        const path = `${user.id}/${Date.now()}-${safeName}`;
        const uploaded = await uploadFile(STAFF_KYC_BUCKET, path, file);
        documentUrl = uploaded.path;
      } catch (error) {
        return { error: error instanceof Error ? `Could not upload the file: ${error.message}` : 'Could not upload the file.' };
      }
    }

    const status = text('status') || 'pending';
    await withUserContext(user.id, (tx) => tx`
      insert into public.hr_kyc_documents (
        owner_id, staff_id, document_type, document_number, address_proof,
        bank_details_status, status, document_url, admin_notes, verified_by, verified_at
      ) values (
        ${user.id}, ${Number(formData.get('staff_id'))}, ${text('document_type')}, ${text('document_number')},
        ${text('address_proof')}, ${text('bank_details_status') || 'pending'}, ${status}, ${documentUrl},
        ${text('admin_notes')}, ${status === 'verified' ? user.id : null}, ${status === 'verified' ? new Date().toISOString() : null}
      )
    `);
    return { error: '' };
  } catch (error) {
    return { error: error instanceof Error ? `Could not save the document: ${error.message}` : 'Could not save the document.' };
  }
}

export async function getKycDownloadUrlAction(path: string): Promise<{ url: string | null }> {
  const url = await getSignedFileUrl(STAFF_KYC_BUCKET, path);
  return { url };
}

const HR_MODULE_TABLES: Record<string, string> = {
  attendance: 'hr_attendance',
  payroll: 'hr_payroll',
  letters: 'hr_letters',
  kyc: 'hr_kyc_documents',
  'work-orders': 'hr_work_orders',
};

export async function insertHrRecordAction(
  module: string,
  payload: Record<string, unknown>,
): Promise<{ error: string }> {
  const table = HR_MODULE_TABLES[module];
  if (!table) return { error: 'Unknown HR module.' };
  try {
    const user = await requireUser();
    const columns = Object.keys(payload);
    const values = columns.map((key) => payload[key]) as DbParameter[];
    const columnList = ['owner_id', ...columns].join(', ');
    const placeholders = ['$1', ...columns.map((_, index) => `$${index + 2}`)].join(', ');
    await withUserContext(user.id, (tx) =>
      tx.unsafe(
        `insert into public.${table} (${columnList}) values (${placeholders})`,
        [user.id, ...values],
      ),
    );
    return { error: '' };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Record could not be saved.' };
  }
}
