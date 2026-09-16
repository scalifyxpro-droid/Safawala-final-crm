'use client';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ListPagination } from '@/components/ui/list-pagination';
type Staff = { id: number; name: string };
type Row = {
  id: string;
  stage: string;
  status: string;
  assigned_staff_id: number | null;
  opened_at: string | null;
  completed_at: string | null;
  event_jobs?: {
    job_number?: string;
    status?: string;
    bookings?: {
      event_name?: string;
      event_date?: string;
      event_location?: string;
    } | null;
  } | null;
  assigned?: { name?: string } | null;
};
const names: Record<string, string> = {
  warehouse_pick: 'Warehouse picking',
  quality_check: 'QC',
  packing: 'Packing',
  stylist_opportunity: 'Event team',
  collection: 'Collection',
  return_quality_check: 'Return QC',
  return_warehouse: 'Return warehouse',
  booking_final_check: 'Accounts / final check',
};
export function WorkOrdersManager({
  initialRecords,
  staff: _staff,
}: {
  initialRecords: Row[];
  staff: Staff[];
}) {
  const [search, setSearch] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [department, setDepartment] = useState('all');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [detail, setDetail] = useState<Row | null>(null);
  const departments = [...new Set(Object.values(names))];
  const rows = useMemo(
    () =>
      initialRecords.filter(
        (r) =>
          (department === 'all' || names[r.stage] === department) &&
          (status === 'all' || r.status === status) &&
          `${r.event_jobs?.job_number ?? ''} ${r.event_jobs?.bookings?.event_name ?? ''} ${names[r.stage]}`
            .toLowerCase()
            .includes(search.toLowerCase()),
      ),
    [initialRecords, department, status, search],
  );
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pagedRows = rows.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );
  return (
    <div className="space-y-5">
      <div className="responsive-kpi-grid grid grid-cols-2 gap-2.5 sm:gap-3 sm:grid-cols-3">
        <Card
          role="button"
          tabIndex={0}
          onClick={() => {
            setStatus('all');
            setPage(1);
          }}
          className="cursor-pointer transition hover:-translate-y-0.5 hover:border-[#d6b98d]"
        >
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Total tasks
            </p>
            <p className="mt-2 text-2xl font-semibold">{rows.length}</p>
          </CardContent>
        </Card>
        <Card
          role="button"
          tabIndex={0}
          onClick={() => {
            setStatus('in_progress');
            setPage(1);
          }}
          className="cursor-pointer transition hover:-translate-y-0.5 hover:border-[#d6b98d]"
        >
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Open / in progress
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {rows.filter((r) => r.status !== 'done').length}
            </p>
          </CardContent>
        </Card>
        <Card
          role="button"
          tabIndex={0}
          onClick={() => {
            setStatus('done');
            setPage(1);
          }}
          className="cursor-pointer transition hover:-translate-y-0.5 hover:border-[#d6b98d]"
        >
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Completed
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {rows.filter((r) => r.status === 'done').length}
            </p>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardContent className="flex flex-wrap gap-3 p-4">
          <form className="flex w-full min-w-0 flex-col gap-2 xl:w-auto xl:flex-row" onSubmit={(event) => { event.preventDefault(); setSearch(searchDraft); setPage(1); if (window.matchMedia('(max-width: 1279px)').matches) { setDepartment('all'); setStatus('all'); } }}>
          <input
            value={searchDraft}
            onChange={(e) => {
              setSearchDraft(e.target.value);
              if (window.matchMedia('(min-width: 1280px)').matches) setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search job or event"
            className="h-10 min-w-0 rounded-lg border bg-white px-3 text-sm dark:bg-card"
          />
          <Button type="submit" variant="outline" className="xl:hidden">Search</Button>
          </form>
          <select
            value={department}
            onChange={(e) => {
              setDepartment(e.target.value);
              setPage(1);
            }}
            className="hidden h-10 rounded-lg border bg-white px-3 text-sm dark:bg-card xl:block"
          >
            <option value="all">All departments</option>
            {departments.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="hidden h-10 rounded-lg border bg-white px-3 text-sm dark:bg-card xl:block"
          >
            <option value="all">All statuses</option>
            {['not_started', 'open', 'in_progress', 'done', 'blocked'].map(
              (s) => (
                <option key={s}>{s.replace('_', ' ')}</option>
              ),
            )}
          </select>
        </CardContent>
      </Card>
      <Card className="gap-0 overflow-hidden py-0">
        <ListPagination
          total={rows.length}
          page={safePage}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          itemLabel="work orders"
        />
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-[#faf8f4] dark:bg-[#241e17] text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-5 py-3">Job / event</th>
                <th className="px-5 py-3">Department task</th>
                <th className="px-5 py-3">Assigned staff</th>
                <th className="px-5 py-3">Due date</th>
                <th className="px-5 py-3">Status</th>
                <th aria-label="Actions" className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="px-5 py-4 font-medium">
                    {r.event_jobs?.job_number ?? 'Job'}
                    <span className="block text-xs text-muted-foreground">
                      {r.event_jobs?.bookings?.event_name ?? 'Event'}
                    </span>
                  </td>
                  <td className="px-5 py-4">{names[r.stage] ?? r.stage}</td>
                  <td className="px-5 py-4">
                    {r.assigned?.name ?? 'Unassigned'}
                  </td>
                  <td className="px-5 py-4">
                    {r.event_jobs?.bookings?.event_date ?? '—'}
                  </td>
                  <td className="px-5 py-4 capitalize">
                    {r.status.replace('_', ' ')}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDetail(r)}
                    >
                      View details
                    </Button>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-12 text-center text-muted-foreground"
                  >
                    No workflow tasks match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
      {detail && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4">
          <Card className="w-full max-w-lg">
            <CardContent className="space-y-3 p-6">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Work order detail
              </p>
              <h2 className="text-xl font-semibold">
                {names[detail.stage] ?? detail.stage}
              </h2>
              <p>
                <strong>{detail.event_jobs?.job_number}</strong> ·{' '}
                {detail.event_jobs?.bookings?.event_name}
              </p>
              <p className="text-sm text-muted-foreground">
                Location:{' '}
                {detail.event_jobs?.bookings?.event_location || 'Not added'}
                <br />
                Event date:{' '}
                {detail.event_jobs?.bookings?.event_date || 'Not added'}
                <br />
                Assigned: {detail.assigned?.name || 'Unassigned'}
                <br />
                Status: {detail.status.replace('_', ' ')}
                <br />
                Completed:{' '}
                {detail.completed_at
                  ? new Date(detail.completed_at).toLocaleString('en-IN')
                  : 'Not completed'}
              </p>
              <div className="flex justify-end">
                <Button onClick={() => setDetail(null)}>Close</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
