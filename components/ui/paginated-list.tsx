'use client';

import { Children, useMemo, useState, type ReactNode } from 'react';
import { ListPagination } from '@/components/ui/list-pagination';

export function PaginatedList({ children, itemLabel = 'items', pageSize: initialPageSize = 10, contentClassName }: { children: ReactNode; itemLabel?: string; pageSize?: number; contentClassName?: string }) {
  const items = useMemo(() => Children.toArray(children), [children]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visible = items.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <>
      <ListPagination total={items.length} page={safePage} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} itemLabel={itemLabel} />
      {contentClassName ? <div className={contentClassName}>{visible}</div> : visible}
    </>
  );
}
