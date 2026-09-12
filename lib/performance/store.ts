import 'server-only';

import { withServiceRole } from '@/lib/db/client';

export type PerformanceCreditRecord = {
  identifier: string;
  name: string;
  department: string;
  completedJobIds: string[];
};

export async function creditPerformance(identifier: string, name: string, department: string, jobId: string) {
  await withServiceRole((tx) => tx`
    insert into public.staff_performance_credits (identifier, name, department, event_job_id)
    values (${identifier}, ${name}, ${department}, ${jobId})
    on conflict (identifier, event_job_id, department) do nothing
  `);
}

export async function listPerformanceCredits(): Promise<PerformanceCreditRecord[]> {
  const rows = await withServiceRole((tx) => tx<{ identifier: string; name: string; department: string; event_job_id: string }[]>`
    select identifier, name, department, event_job_id from public.staff_performance_credits
  `);
  const map = new Map<string, PerformanceCreditRecord>();
  for (const row of rows) {
    const identifier = String(row.identifier);
    const current = map.get(identifier) ?? { identifier, name: String(row.name), department: String(row.department), completedJobIds: [] };
    current.completedJobIds.push(String(row.event_job_id));
    map.set(identifier, current);
  }
  return [...map.values()].sort((a, b) => b.completedJobIds.length - a.completedJobIds.length);
}
