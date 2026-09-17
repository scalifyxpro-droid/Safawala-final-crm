import 'server-only';

import { withServiceRole } from '@/lib/db/client';

export type PersonalPerformanceCredit = {
  eventJobId: string;
  department: string;
  creditedAt: string;
  eventName: string;
  eventDate: string | null;
  bookingNumber: string | null;
};

export type PersonalAttendanceRecord = {
  date: string;
  status: 'present' | 'late' | 'absent' | 'half_day' | 'on_leave';
  workingHours: number;
  overtime: number;
};

export type PersonalPerformanceData = {
  credits: PersonalPerformanceCredit[];
  attendance: PersonalAttendanceRecord[];
};

export type StaffPerformanceOverview = {
  staffMemberId: number;
  name: string;
  loginId: string;
  departments: string[];
  completedEvents: number;
  completedThisMonth: number;
  attendanceDays: number;
  workingHours: number;
  overtime: number;
  lastCreditAt: string | null;
};

export type PerformanceCreditRecord = {
  identifier: string;
  name: string;
  department: string;
  completedJobIds: string[];
};

export async function creditPerformance(
  identifier: string,
  name: string,
  department: string,
  jobId: string,
) {
  await withServiceRole(
    (tx) => tx`
    insert into public.staff_performance_credits (staff_id, identifier, name, department, event_job_id)
    values (
      (
        select sm.id
        from public.staff_members sm
        where sm.user_id::text = ${identifier}
          or lower(sm.name) = lower(${name})
        order by (sm.user_id::text = ${identifier}) desc, sm.id
        limit 1
      ),
      ${identifier}, ${name}, ${department}, ${jobId}
    )
    on conflict (identifier, event_job_id, department) do nothing
  `,
  );
}

/**
 * Returns only the signed-in staff member's records. Older performance credits
 * did not always store staff_id, so the name/account identifiers are used only
 * as a backwards-compatible fallback for those legacy rows.
 */
export async function getPersonalPerformanceData(input: {
  staffMemberId: number;
  userId: string;
  name: string;
}): Promise<PersonalPerformanceData> {
  const legacyIdentifiers = [input.userId, input.name].map((value) =>
    value.toLowerCase(),
  );

  return withServiceRole(async (tx) => {
    const [creditRows, attendanceRows] = await Promise.all([
      tx<
        {
          event_job_id: string;
          department: string;
          credited_at: string;
          event_name: string | null;
          event_date: string | null;
          booking_number: string | null;
        }[]
      >`
        select
          c.event_job_id,
          c.department,
          c.credited_at,
          coalesce(j.state -> 'eventSummary' ->> 'eventName', 'Completed event') as event_name,
          nullif(j.state -> 'eventSummary' ->> 'eventDate', '') as event_date,
          nullif(b.booking_number, '') as booking_number
        from public.staff_performance_credits c
        left join public.event_jobs j on j.id = c.event_job_id
        left join public.bookings b on b.id = j.booking_id
        where c.staff_id = ${input.staffMemberId}
          or (
            c.staff_id is null
            and (
              lower(c.name) = lower(${input.name})
              or lower(c.identifier) = any(${tx.array(legacyIdentifiers)}::text[])
              or lower(split_part(c.identifier, ':', 2)) = any(${tx.array(legacyIdentifiers)}::text[])
            )
          )
        order by c.credited_at desc
      `,
      tx<
        {
          attendance_date: string;
          status: PersonalAttendanceRecord['status'];
          working_hours: number;
          overtime: number;
        }[]
      >`
        select attendance_date, status, working_hours::float8 as working_hours,
          overtime::float8 as overtime
        from public.hr_attendance
        where staff_id = ${input.staffMemberId}
          and attendance_date >= (current_date - interval '6 months')::date
        order by attendance_date desc
      `,
    ]);

    return {
      credits: creditRows.map((row) => ({
        eventJobId: String(row.event_job_id),
        department: String(row.department),
        creditedAt: String(row.credited_at),
        eventName: row.event_name || 'Completed event',
        eventDate: row.event_date ? String(row.event_date) : null,
        bookingNumber: row.booking_number ? String(row.booking_number) : null,
      })),
      attendance: attendanceRows.map((row) => ({
        date: String(row.attendance_date),
        status: row.status,
        workingHours: Number(row.working_hours || 0),
        overtime: Number(row.overtime || 0),
      })),
    };
  });
}

export async function listStaffPerformanceOverview(): Promise<
  StaffPerformanceOverview[]
> {
  const rows = await withServiceRole(
    (tx) => tx<
      {
        staff_member_id: number;
        name: string;
        login_id: string | null;
        departments: string[] | null;
        completed_events: number;
        completed_this_month: number;
        attendance_days: number;
        working_hours: number;
        overtime: number;
        last_credit_at: string | null;
      }[]
    >`
    select
      sm.id as staff_member_id,
      sm.name,
      sm.login_id,
      coalesce(
        array_agg(distinct sd.department) filter (where sd.department is not null),
        array[]::text[]
      ) as departments,
      (
        select count(distinct c.event_job_id)::int
        from public.staff_performance_credits c
        where c.staff_id = sm.id
          or (c.staff_id is null and lower(c.name) = lower(sm.name))
      ) as completed_events,
      (
        select count(distinct c.event_job_id)::int
        from public.staff_performance_credits c
        where (c.staff_id = sm.id or (c.staff_id is null and lower(c.name) = lower(sm.name)))
          and c.credited_at >= date_trunc('month', now())
      ) as completed_this_month,
      (
        select count(*)::int
        from public.hr_attendance a
        where a.staff_id = sm.id
          and a.attendance_date >= date_trunc('month', current_date)::date
          and a.status in ('present', 'late', 'half_day')
      ) as attendance_days,
      (
        select coalesce(sum(a.working_hours), 0)::float8
        from public.hr_attendance a
        where a.staff_id = sm.id
          and a.attendance_date >= date_trunc('month', current_date)::date
      ) as working_hours,
      (
        select coalesce(sum(a.overtime), 0)::float8
        from public.hr_attendance a
        where a.staff_id = sm.id
          and a.attendance_date >= date_trunc('month', current_date)::date
      ) as overtime,
      (
        select max(c.credited_at)
        from public.staff_performance_credits c
        where c.staff_id = sm.id
          or (c.staff_id is null and lower(c.name) = lower(sm.name))
      ) as last_credit_at
    from public.staff_members sm
    left join public.staff_departments sd on sd.staff_id = sm.id
    where sm.is_active = true and sm.portal_kind = 'staff'
    group by sm.id, sm.name, sm.login_id
    order by completed_events desc, sm.name asc
  `,
  );

  return rows.map((row) => ({
    staffMemberId: Number(row.staff_member_id),
    name: row.name,
    loginId: row.login_id || `Staff #${row.staff_member_id}`,
    departments: row.departments ?? [],
    completedEvents: Number(row.completed_events || 0),
    completedThisMonth: Number(row.completed_this_month || 0),
    attendanceDays: Number(row.attendance_days || 0),
    workingHours: Number(row.working_hours || 0),
    overtime: Number(row.overtime || 0),
    lastCreditAt: row.last_credit_at ? String(row.last_credit_at) : null,
  }));
}

export async function listPerformanceCredits(): Promise<
  PerformanceCreditRecord[]
> {
  const rows = await withServiceRole(
    (tx) => tx<
      {
        identifier: string;
        name: string;
        department: string;
        event_job_id: string;
      }[]
    >`
    select identifier, name, department, event_job_id from public.staff_performance_credits
  `,
  );
  const map = new Map<string, PerformanceCreditRecord>();
  for (const row of rows) {
    const identifier = String(row.identifier);
    const current = map.get(identifier) ?? {
      identifier,
      name: String(row.name),
      department: String(row.department),
      completedJobIds: [],
    };
    current.completedJobIds.push(String(row.event_job_id));
    map.set(identifier, current);
  }
  return [...map.values()].sort(
    (a, b) => b.completedJobIds.length - a.completedJobIds.length,
  );
}
