import { redirect } from 'next/navigation';
import { DashboardShell } from '@/components/layout/dashboard-shell';
import { DashboardHeader } from '@/components/layout/dashboard-header';
import { Card, CardContent } from '@/components/ui/card';
import { getCurrentUser } from '@/lib/auth/session';
import { withUserContext } from '@/lib/db/client';
import { HrRecordManager } from '@/components/hr/hr-record-manager';
import { AttendanceManager } from '@/components/hr/attendance-manager';
import { PayrollManager } from '@/components/hr/payroll-manager';
import { LettersManager } from '@/components/hr/letters-manager';
import { KycManager } from '@/components/hr/kyc-manager';
import { WorkOrdersManager } from '@/components/hr/work-orders-manager';

const modules = {
  attendance: {
    title: 'Attendance',
    subtitle: 'Daily presence and leave records',
    table: 'hr_attendance',
    staffColumn: 'staff_id',
    columns: [
      'attendance_date',
      'status',
      'check_in',
      'check_out',
      'working_hours',
      'overtime',
    ],
  },
  payroll: {
    title: 'Payroll',
    subtitle: 'Salary processing and payment status',
    table: 'hr_payroll',
    staffColumn: 'staff_id',
    columns: [
      'period',
      'base_salary',
      'allowances',
      'deductions',
      'advances',
      'net_salary',
      'status',
    ],
  },
  letters: {
    title: 'HR Letters',
    subtitle: 'Employee letters issued by HR',
    table: 'hr_letters',
    staffColumn: 'staff_id',
    columns: ['letter_type', 'title', 'issued_on'],
  },
  kyc: {
    title: 'KYC & Documents',
    subtitle: 'Identity documents and verification status',
    table: 'hr_kyc_documents',
    staffColumn: 'staff_id',
    columns: [
      'document_type',
      'document_number',
      'address_proof',
      'bank_details_status',
      'status',
    ],
  },
  'work-orders': {
    title: 'Work Orders',
    subtitle: 'HR and department assignments',
    table: 'hr_work_orders',
    staffColumn: 'assigned_staff_id',
    columns: ['title', 'department', 'status', 'due_date'],
  },
} as const;

export const dynamic = 'force-dynamic';

export default async function HrModulePage({
  params,
}: {
  params: Promise<{ module: string }>;
}) {
  const { module } = await params;
  const config = modules[module as keyof typeof modules];
  if (!config) redirect('/hr');
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  let data: Record<string, unknown>[] = [];
  let staff: { id: number; name: string }[] = [];
  let workflow: Record<string, unknown>[] | null = null;
  let error: Error | null = null;
  let workflowError: Error | null = null;

  try {
    const result = await withUserContext(user.id, async (tx) => {
      const [rows, staffRows] = await Promise.all([
        tx.unsafe(
          `select t.*, case when s.id is null then null else json_build_object('name', s.name) end as staff_members
           from public.${config.table} t
           left join public.staff_members s on s.id = t.${config.staffColumn}
           order by t.${config.columns[0]} desc
           limit 100`,
        ),
        tx<{ id: number; name: string }[]>`
          select id, name from public.staff_members where is_active = true order by name
        `,
      ]);
      let workflowRows: Record<string, unknown>[] | null = null;
      if (module === 'work-orders') {
        workflowRows = (await tx.unsafe(
          `select
             ejs.id, ejs.stage, ejs.status, ejs.assigned_staff_id, ejs.opened_at, ejs.completed_at,
             case when s.id is null then null else json_build_object('name', s.name) end as assigned,
             json_build_object(
               'job_number', ej.job_number, 'status', ej.status,
               'bookings', case when b.id is null then null else json_build_object(
                 'event_name', b.event_name, 'event_date', b.event_date, 'event_location', b.event_location
               ) end
             ) as event_jobs
           from public.event_job_stages ejs
           left join public.staff_members s on s.id = ejs.assigned_staff_id
           left join public.event_jobs ej on ej.id = ejs.event_job_id
           left join public.bookings b on b.id = ej.booking_id
           order by ejs.opened_at desc
           limit 200`,
        )) as unknown as Record<string, unknown>[];
      }
      return { rows: rows as unknown as Record<string, unknown>[], staffRows, workflowRows };
    });
    data = result.rows;
    staff = result.staffRows;
    workflow = result.workflowRows;
  } catch (err) {
    error = err instanceof Error ? err : new Error('Unable to load HR records.');
    if (module === 'work-orders') workflowError = error;
  }

  if (module === 'attendance')
    return (
      <DashboardShell email={user.email ?? 'Safawala user'}>
        <div className="mx-auto max-w-[1280px] space-y-6">
          <DashboardHeader title={config.title} subtitle={config.subtitle} backHref="/hr" />
          {error && (
            <Card className="border-[#e4d2b6] bg-[#fffaf2] dark:bg-[#241e17]">
              <CardContent className="p-5">
                <p className="font-semibold text-[#70481c]">
                  HR records could not be loaded
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{error.message}</p>
              </CardContent>
            </Card>
          )}
          <AttendanceManager
            initialRecords={(data ?? []) as never}
            staff={(staff ?? []) as { id: number; name: string }[]}
          />
        </div>
      </DashboardShell>
    );
  if (module === 'payroll')
    return (
      <DashboardShell email={user.email ?? 'Safawala user'}>
        <div className="mx-auto max-w-[1280px] space-y-6">
          <DashboardHeader title={config.title} subtitle={config.subtitle} backHref="/hr" />
          {error && (
            <Card className="border-[#e4d2b6] bg-[#fffaf2] dark:bg-[#241e17]">
              <CardContent className="p-5">
                <p className="font-semibold text-[#70481c]">
                  HR records could not be loaded
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{error.message}</p>
              </CardContent>
            </Card>
          )}
          <PayrollManager
            initialRecords={(data ?? []) as never}
            staff={(staff ?? []) as { id: number; name: string }[]}
          />
        </div>
      </DashboardShell>
    );
  if (module === 'letters')
    return (
      <DashboardShell email={user.email ?? 'Safawala user'}>
        <div className="mx-auto max-w-[1280px] space-y-6">
          <DashboardHeader title={config.title} subtitle={config.subtitle} backHref="/hr" />
          {error && (
            <Card className="border-[#e4d2b6] bg-[#fffaf2] dark:bg-[#241e17]">
              <CardContent className="p-5">
                <p className="font-semibold text-[#70481c]">
                  HR records could not be loaded
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{error.message}</p>
              </CardContent>
            </Card>
          )}
          <LettersManager
            initialRecords={(data ?? []) as never}
            staff={(staff ?? []) as { id: number; name: string }[]}
          />
        </div>
      </DashboardShell>
    );
  if (module === 'kyc')
    return (
      <DashboardShell email={user.email ?? 'Safawala user'}>
        <div className="mx-auto max-w-[1280px] space-y-6">
          <DashboardHeader title={config.title} subtitle={config.subtitle} backHref="/hr" />
          {error && (
            <Card className="border-[#e4d2b6] bg-[#fffaf2] dark:bg-[#241e17]">
              <CardContent className="p-5">
                <p className="font-semibold text-[#70481c]">
                  HR records could not be loaded
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{error.message}</p>
              </CardContent>
            </Card>
          )}
          <KycManager
            initialRecords={(data ?? []) as never}
            staff={(staff ?? []) as { id: number; name: string }[]}
          />
        </div>
      </DashboardShell>
    );
  if (module === 'work-orders')
    return (
      <DashboardShell email={user.email ?? 'Safawala user'}>
        <div className="mx-auto max-w-[1280px] space-y-6">
          <DashboardHeader backHref="/hr"
            title={config.title}
            subtitle="Live operational tasks from the existing event workflow"
          />
          {workflowError && (
            <Card className="border-[#e4d2b6] bg-[#fffaf2] dark:bg-[#241e17]">
              <CardContent className="p-5">
                <p className="font-semibold text-[#70481c]">
                  Event workflow is not available
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{workflowError.message}</p>
              </CardContent>
            </Card>
          )}
          <WorkOrdersManager
            initialRecords={(workflow ?? []) as never}
            staff={(staff ?? []) as { id: number; name: string }[]}
          />
        </div>
      </DashboardShell>
    );
  return (
    <DashboardShell email={user.email ?? 'Safawala user'}>
      <div className="mx-auto max-w-[1280px] space-y-6">
        <DashboardHeader title={config.title} subtitle={config.subtitle} backHref="/hr" />
        {error && (
          <Card className="border-[#e4d2b6] bg-[#fffaf2] dark:bg-[#241e17]">
            <CardContent className="p-5">
              <p className="font-semibold text-[#70481c]">
                HR records could not be loaded
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{error.message}</p>
            </CardContent>
          </Card>
        )}
        <HrRecordManager
          module={module}
          staff={(staff ?? []) as { id: number; name: string }[]}
        />
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-[#faf8f4] dark:bg-[#241e17] text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-3">Employee / work</th>
                  {config.columns.map((column) => (
                    <th key={column} className="px-5 py-3">
                      {column.replaceAll('_', ' ')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {((data as Record<string, unknown>[]) ?? []).map((row) => (
                  <tr key={String(row.id)} className="border-b last:border-0">
                    <td className="px-5 py-4 font-medium">
                      {typeof row.staff_members === 'object' &&
                      row.staff_members
                        ? String(
                            (row.staff_members as { name?: string }).name ??
                              'Assigned',
                          )
                        : String(row.title ?? 'Employee')}
                    </td>
                    {config.columns.map((column) => (
                      <td
                        key={column}
                        className="px-5 py-4 text-muted-foreground"
                      >
                        {row[column] == null ? '—' : String(row[column])}
                      </td>
                    ))}
                  </tr>
                ))}
                {!data?.length && (
                  <tr>
                    <td
                      colSpan={config.columns.length + 1}
                      className="px-5 py-12 text-center text-muted-foreground"
                    >
                      {error
                        ? 'HR records could not be loaded.'
                        : 'No records yet.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
