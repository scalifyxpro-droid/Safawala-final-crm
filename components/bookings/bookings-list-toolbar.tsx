'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { ShoppingBag, Truck } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

type BookingMode = 'sale' | 'rental';

const modes: {
  value: BookingMode;
  label: string;
  icon: typeof ShoppingBag;
}[] = [
  { value: 'sale', label: 'Sale', icon: ShoppingBag },
  { value: 'rental', label: 'Rental', icon: Truck },
];

export function BookingsListToolbar({
  mode,
  count,
  from,
  to,
  pageSize,
  itemLabel = 'bookings',
}: {
  mode: BookingMode;
  count: number;
  from: number;
  to: number;
  pageSize: number;
  itemLabel?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  function hrefForMode(nextMode: BookingMode) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('type', nextMode);
    params.delete('page');
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  function changePageSize(nextSize: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('perPage', nextSize);
    params.delete('page');
    router.push(`${pathname}?${params.toString()}`);
  }

  const saleHref = hrefForMode('sale');
  const rentalHref = hrefForMode('rental');

  useEffect(() => {
    router.prefetch(saleHref);
    router.prefetch(rentalHref);
  }, [rentalHref, router, saleHref]);

  return (
    <div className="flex flex-col items-center gap-3 border-b bg-white px-4 py-3 dark:bg-card lg:flex-row lg:justify-between">
      <div
        className="inline-flex w-fit items-center rounded-xl border bg-[#fcfaf7] p-1 shadow-sm dark:bg-[#241e17]"
        aria-label="Booking mode"
      >
        {modes.map(({ value, label, icon: Icon }) => {
          const active = mode === value;
          const href = value === 'rental' ? rentalHref : saleHref;
          return (
            <Link
              key={label}
              href={href}
              prefetch
              aria-current={active ? 'page' : undefined}
              className={`inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors ${
                active
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-white dark:hover:bg-card hover:text-foreground'
              }`}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-center text-sm lg:justify-start lg:text-left">
        <p className="text-muted-foreground" aria-live="polite">
          {count === 0 ? (
            `No ${itemLabel} to show`
          ) : (
            <>
              Showing <span className="font-semibold text-foreground">{from}</span>{' '}
              to <span className="font-semibold text-foreground">{to}</span> of{' '}
              <span className="font-semibold text-foreground">{count}</span>{' '}
              {itemLabel}
            </>
          )}
        </p>
        <label className="flex items-center gap-2 text-muted-foreground">
          <span>Items per page</span>
          <select
            value={String(pageSize)}
            onChange={(event) => changePageSize(event.target.value)}
            className="h-9 rounded-lg border bg-white dark:bg-card px-3 font-semibold text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
            aria-label="Items per page"
          >
            <option value="10">10</option>
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
        </label>
      </div>
    </div>
  );
}
