'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const LIST_PAGE_SIZES = [10, 25, 50, 100] as const;

export function ListPagination({
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  itemLabel = 'items',
}: {
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  itemLabel?: string;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(page, 1), pageCount);
  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, total);

  return (
    <div className="flex min-w-0 flex-col gap-2.5 border-b bg-white px-3 py-3 dark:bg-card sm:px-5 lg:flex-row lg:items-center lg:justify-between">
      <div className="grid min-w-0 gap-2 text-xs min-[430px]:grid-cols-[minmax(0,1fr)_auto] min-[430px]:items-center sm:text-sm">
        <p className="min-w-0 truncate text-muted-foreground" aria-live="polite">
          {total === 0 ? (
            `No ${itemLabel} to show`
          ) : (
            <>
              Showing <strong className="text-foreground">{from}</strong> to{' '}
              <strong className="text-foreground">{to}</strong> of{' '}
              <strong className="text-foreground">{total}</strong> {itemLabel}
            </>
          )}
        </p>
        <label className="flex items-center justify-between gap-2 text-muted-foreground min-[430px]:justify-start">
          <span className="whitespace-nowrap">Items per page</span>
          <select
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className="h-9 min-w-16 rounded-lg border bg-white px-2 font-semibold text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 dark:bg-card"
            aria-label={`Items per page for ${itemLabel}`}
          >
            {LIST_PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border/70 pt-2.5 lg:justify-end lg:border-t-0 lg:pt-0">
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft />
        </Button>
        <span className="min-w-20 text-center text-xs text-muted-foreground">
          Page {safePage} of {pageCount}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={safePage >= pageCount}
          onClick={() => onPageChange(safePage + 1)}
          aria-label="Next page"
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
