'use client';

import { useMemo, useState } from 'react';
import {
  Activity,
  CalendarClock,
  Check,
  Circle,
  MapPin,
  Route,
  X,
  Search,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ListPagination } from '@/components/ui/list-pagination';
import { friendlyDate } from '@/lib/bookings';
import { trackingTimeline, TRACKING_STAGE_LABEL } from '@/lib/event-jobs/constants';
import type { EventJob } from '@/lib/event-jobs/types';
import {
  compareJobsByBookingDate,
  compareJobsByEventSchedule,
} from '@/lib/event-jobs/sorting';

function currentStage(job: EventJob) {
  if (job.status === 'closed') return 'Completed';
  const active = trackingTimeline(job.stages)
    .filter(
      (stage) => stage.status === 'open' || stage.status === 'in_progress',
    )
    .map((stage) => TRACKING_STAGE_LABEL[stage.key]);
  return active.length ? active.join(' + ') : 'Awaiting next stage';
}

export function EventTrackingList({ jobs }: { jobs: EventJob[] }) {
  const [selected, setSelected] = useState<EventJob | null>(null);
  const [search, setSearch] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [sortBy, setSortBy] = useState<'event' | 'booking'>('event');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const filteredJobs = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...jobs]
      .sort(sortBy === 'booking' ? compareJobsByBookingDate : compareJobsByEventSchedule)
      .filter((job) => (!query || `${job.eventSummary.customerName ?? ''} ${job.bookingNumber} ${job.eventSummary.eventName} ${job.eventSummary.venue ?? ''}`.toLowerCase().includes(query)) && (!eventDate || job.eventSummary.eventDate === eventDate));
  }, [jobs, search, eventDate, sortBy]);
  const pageCount = Math.max(1, Math.ceil(filteredJobs.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visibleJobs = filteredJobs.slice((safePage - 1) * pageSize, safePage * pageSize);

  if (!jobs.length) {
    return (
      <Card className="border-border shadow-level-1">
        <CardContent className="grid min-h-48 place-items-center p-6 text-center">
          <div>
            <Activity className="mx-auto size-8 text-primary" />
            <h2 className="mt-3 font-semibold">No events to track</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Confirmed booking jobs will appear here automatically.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="gap-0 overflow-hidden border-border py-0 shadow-level-1">
        <div className="grid gap-2 border-b bg-[#fcfaf7] p-4 dark:bg-[#241e17] sm:grid-cols-[minmax(0,1fr)_180px_180px]"><label className="relative block"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><input aria-label="Search jobs" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search customer, booking, event, or location…" className="h-10 w-full rounded-lg border border-input bg-white pl-9 pr-3 text-sm outline-none focus:border-primary dark:bg-card" /></label><label className="text-xs font-medium text-muted-foreground"><span className="sr-only">Filter event date</span><input type="date" aria-label="Filter event date" value={eventDate} onChange={(event) => { setEventDate(event.target.value); setPage(1); }} className="h-10 w-full rounded-lg border border-input bg-white px-3 text-sm font-normal text-foreground outline-none focus:border-primary dark:bg-card" /></label><select aria-label="Sort jobs by" value={sortBy} onChange={(event) => { setSortBy(event.target.value as 'event' | 'booking'); setPage(1); }} className="h-10 rounded-lg border border-input bg-white px-3 text-sm text-foreground outline-none focus:border-primary dark:bg-card"><option value="event">Sort by Event date</option><option value="booking">Sort by Booking date</option></select></div>
        <ListPagination total={filteredJobs.length} page={safePage} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} itemLabel="jobs" />
        <div className="divide-y divide-border">
          {visibleJobs.map((job) => (
            <div
              key={job.id}
              className="flex flex-col gap-3 px-4 py-4 transition hover:bg-[#fcfaf7] dark:hover:bg-[#241e17] sm:flex-row sm:items-center"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#f5ead8] text-[#8a5b24]">
                <Route className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <h2 className="truncate text-sm font-semibold">
                    {job.eventSummary.customerName || 'Customer not added'}
                  </h2>
                  <Badge
                    variant="outline"
                    className={
                      job.status === 'closed'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-amber-200 bg-amber-50 text-amber-800'
                    }
                  >
                    {job.status === 'closed' ? 'Closed' : 'Active'}
                  </Badge>
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {job.eventSummary.eventName} · {job.bookingNumber} · {currentStage(job)}
                </p>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                  <span className="rounded-md bg-[#f7f0e6] px-2 py-1 text-[#70481c]">Booking date: {friendlyDate(job.createdAt.slice(0, 10))}</span>
                  <span className="rounded-md bg-[#f5f5f4] px-2 py-1 text-muted-foreground">Event date: {friendlyDate(job.eventSummary.eventDate)}</span>
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 w-fit shrink-0 bg-white dark:bg-card px-3 text-xs"
                onClick={() => setSelected(job)}
              >
                <Route className="size-3.5" />
                Track
              </Button>
            </div>
          ))}
        </div>
      </Card>

      {selected ? (
        <div className="fixed inset-0 z-[80] grid place-items-center p-3 sm:p-5">
          <button
            type="button"
            aria-label="Close job tracker"
            onClick={() => setSelected(null)}
            className="absolute inset-0 bg-[#211d18]/55 backdrop-blur-[2px]"
          />
          <dialog
            open
            aria-modal="true"
            aria-labelledby="tracking-title"
            className="relative z-10 m-0 flex h-fit max-h-[calc(100dvh-1.5rem)] w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-white/50 bg-[#fffdf9] p-0 text-foreground shadow-[0_24px_70px_rgb(20_15_10_/.3)] sm:max-h-[calc(100dvh-2.5rem)]"
          >
            <header className="border-b bg-[#fcfaf7] dark:bg-[#241e17] px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Job tracker
                  </p>
                  <h2
                    id="tracking-title"
                    className="mt-1 truncate text-lg font-semibold"
                  >
                    {selected.eventSummary.customerName || 'Customer not added'}
                  </h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {selected.bookingNumber} · {selected.eventSummary.eventName}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Close job tracker"
                  onClick={() => setSelected(null)}
                  className="grid size-8 shrink-0 place-items-center rounded-full border bg-white dark:bg-card text-muted-foreground transition hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                <p className="flex items-center gap-1.5">
                  <CalendarClock className="size-3.5" />
                  Event date: {friendlyDate(selected.eventSummary.eventDate)}
                </p>
                <p className="text-xs text-muted-foreground">Booking date: {friendlyDate(selected.createdAt.slice(0, 10))}</p>
                {selected.eventSummary.venue ? (
                  <p className="flex items-center gap-1.5">
                    <MapPin className="size-3.5" />
                    <span className="truncate">
                      {selected.eventSummary.venue}
                    </span>
                  </p>
                ) : null}
              </div>
            </header>

            <ol className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {trackingTimeline(selected.stages).map(
                (stage, index, orderedStages) => {
                  const done = stage.status === 'done';
                  const current =
                    stage.status === 'open' || stage.status === 'in_progress';
                  return (
                    <li
                      key={stage.key}
                      className="relative flex gap-3 pb-5 last:pb-0"
                    >
                      {index < orderedStages.length - 1 ? (
                        <span
                          aria-hidden="true"
                          className={`absolute left-[10px] top-5 h-full w-px ${done ? 'bg-emerald-300' : 'bg-border'}`}
                        />
                      ) : null}
                      <span
                        className={`relative z-10 mt-0.5 grid size-[21px] shrink-0 place-items-center rounded-full border ${
                          done
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                            : current
                              ? 'border-[#a86f2c] bg-[#f5ead8] text-[#70481c]'
                              : 'border-border bg-[#f8f6f2] text-muted-foreground'
                        }`}
                      >
                        {done ? (
                          <Check className="size-3" />
                        ) : (
                          <Circle className="size-2 fill-current" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {TRACKING_STAGE_LABEL[stage.key]}
                        </p>
                        <p
                          className={`mt-0.5 text-xs ${
                            done
                              ? 'text-emerald-700'
                              : current
                                ? 'text-[#9a6124]'
                                : 'text-muted-foreground'
                          }`}
                        >
                          {done
                            ? 'Completed'
                            : current
                              ? 'In progress'
                              : 'Waiting'}
                        </p>
                      </div>
                    </li>
                  );
                },
              )}
            </ol>
          </dialog>
        </div>
      ) : null}
    </>
  );
}
