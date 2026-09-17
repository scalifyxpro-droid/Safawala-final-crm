'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CalendarDays, CheckCircle2, MapPin, Package, Workflow } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ListPagination } from '@/components/ui/list-pagination';
import { bookingDateHeading } from '@/lib/bookings';
import { Fragment } from 'react';

export type DepartmentJobCardItem = {
  id: string;
  href: string;
  jobNumber: string;
  bookingType: 'sale' | 'rental';
  customerName: string;
  eventName: string;
  bookingNumber: string;
  bookingDate: string;
  bookingDateKey?: string;
  eventDate: string;
  eventTime?: string | null;
  venue?: string | null;
  itemCount: number;
  departmentStatus: string;
  departmentComplete: boolean;
  jobComplete: boolean;
  jobStatusLabel?: string;
};

export function DepartmentJobCardGrid({
  items,
  groupByBookingDate = false,
  clickableCards = false,
}: {
  items: DepartmentJobCardItem[];
  groupByBookingDate?: boolean;
  clickableCards?: boolean;
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visibleItems = items.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );

  return (
    <Card className="gap-0 overflow-hidden border-border py-0 shadow-level-1">
      <ListPagination
        total={items.length}
        page={safePage}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
        itemLabel="jobs"
      />
      <CardContent className="bg-[#f8f2e9]/65 p-3 dark:bg-[#201a14] sm:p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visibleItems.map((item, index) => (
            <Fragment key={item.id}>
              {groupByBookingDate && item.bookingDateKey !== visibleItems[index - 1]?.bookingDateKey ? (
                <div className="col-span-full flex items-center gap-3 pt-2 first:pt-0">
                  <h2 className="shrink-0 text-sm font-semibold text-[#70481c] dark:text-[#e6c99d]">
                    {bookingDateHeading(item.bookingDateKey ?? '')}
                  </h2>
                  <span className="h-px flex-1 bg-[#dfc59e] dark:bg-[#493822]" aria-hidden="true" />
                </div>
              ) : null}
            <article
              className={`relative flex min-w-0 flex-col rounded-xl border border-[#dfc59e] bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-level-2 dark:border-[#493822] dark:bg-card ${clickableCards ? 'cursor-pointer' : ''}`}
            >
              {clickableCards ? <Link href={item.href} aria-label={`View details for ${item.jobNumber}, ${item.customerName}`} className="absolute inset-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" /> : null}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9b5f17]">
                    {item.jobNumber}
                  </p>
                  <h2 className="mt-1 truncate text-sm font-semibold">
                    {item.customerName}
                  </h2>
                  <p className="mt-0.5 truncate text-xs text-[#70481c] dark:text-[#e6c99d]">
                    {item.eventName} · {item.bookingNumber}
                  </p>
                </div>
                <Badge className="shrink-0 border-[#e5cda9] bg-[#f8eddc] text-[10px] font-medium capitalize text-[#8a5517] dark:border-[#5c4529] dark:bg-[#33291c] dark:text-[#f0d9ad]" variant="outline">
                  {item.bookingType}
                </Badge>
              </div>

              <div className="mt-3 space-y-1.5 rounded-lg bg-[#faf8f5] px-3 py-2.5 text-[11px] text-muted-foreground dark:bg-[#241e17]">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="size-3.5" aria-hidden="true" />
                    Event: {item.eventDate}{item.eventTime ? ` · ${item.eventTime}` : ''}
                  </span>
                  {item.venue ? (
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                      <span className="truncate">{item.venue}</span>
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="inline-flex items-center gap-1.5">
                    <Package className="size-3.5" aria-hidden="true" />
                    {item.itemCount} {item.itemCount === 1 ? 'item' : 'items'}
                  </span>
                  {!groupByBookingDate ? <span>Booking: {item.bookingDate}</span> : null}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#ead8bc] pt-3 dark:border-[#493822]">
                <Link
                  href={item.href}
                  className="relative z-10 inline-flex h-9 items-center justify-center rounded-lg border border-border bg-[#fcfaf7] px-3 text-xs font-medium transition hover:bg-[#f5ead8] hover:text-[#70481c] dark:bg-[#241e17]"
                >
                  View details
                </Link>
                <Badge
                  variant="outline"
                  className={item.departmentComplete
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-amber-200 bg-amber-50 text-amber-800'}
                >
                  {item.departmentStatus}
                </Badge>
                <Badge
                  variant="outline"
                  className={item.jobComplete
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-sky-200 bg-sky-50 text-sky-700'}
                >
                  {item.jobComplete ? (
                    <CheckCircle2 className="size-3" />
                  ) : (
                    <Workflow className="size-3" />
                  )}
                  {item.jobStatusLabel ?? (item.jobComplete ? 'Job completed' : 'Workflow active')}
                </Badge>
              </div>
            </article>
            </Fragment>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
