'use client';

import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';

type Props = {
  basePath: string;
  search?: string;
  view?: 'open' | 'closed';
};

export function QueueFilterBar({
  basePath,
  search = '',
  view = 'open',
}: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState(search);

  useEffect(() => setDraft(search), [search]);

  useEffect(() => {
    const query = draft.trim();
    if (query === search.trim()) return;

    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams();
      if (view === 'closed') params.set('view', 'closed');
      if (query) params.set('q', query);
      router.replace(params.size ? `${basePath}?${params}` : basePath, { scroll: false });
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [basePath, draft, router, search, view]);

  return (
    <div className="min-w-0 rounded-xl border border-border bg-[#fcfaf7] p-2.5 dark:bg-[#241e17] sm:p-3">
      <label className="relative block min-w-0">
        <span className="sr-only">Search jobs</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Search customer, booking, event, or location…"
          autoComplete="off"
          className="h-11 w-full min-w-0 rounded-lg border border-input bg-white pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10 dark:bg-card"
        />
      </label>
    </div>
  );
}
