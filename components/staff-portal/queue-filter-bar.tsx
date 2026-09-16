'use client';

import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import type { FormEvent } from 'react';

type Props = {
  basePath: string;
  search?: string;
  sort?: string;
  eventDate?: string;
  bookingDate?: string;
};

export function QueueFilterBar({
  basePath,
  search = '',
  sort = 'booking',
  eventDate = '',
  bookingDate = '',
}: Props) {
  const router = useRouter();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    const values = new FormData(event.currentTarget);
    const query = String(values.get('q') ?? '').trim();
    if (query) params.set('q', query);
    if (window.matchMedia('(min-width: 1280px)').matches) {
      for (const name of ['bookingDate', 'eventDate', 'sort']) {
        const value = String(values.get(name) ?? '');
        if (value && !(name === 'sort' && value === 'booking')) {
          params.set(name, value);
        }
      }
    }
    router.push(params.size ? `${basePath}?${params}` : basePath);
  }

  return (
    <form
      action={basePath}
      onSubmit={submit}
      className="grid min-w-0 gap-2 rounded-xl border border-border bg-[#fcfaf7] p-3 dark:bg-[#241e17] sm:grid-cols-[minmax(0,1fr)_auto] xl:grid-cols-[minmax(0,1fr)_170px_170px_210px]"
    >
      <label className="relative min-w-0">
        <span className="sr-only">Search jobs</span>
        <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
        <input
          name="q"
          defaultValue={search}
          placeholder="Search customer, booking, event, or location…"
          className="h-10 w-full min-w-0 rounded-lg border border-input bg-white pl-9 pr-3 text-sm outline-none focus:border-primary dark:bg-card"
        />
      </label>
      <button
        type="submit"
        className="h-10 rounded-lg border border-input bg-white px-5 text-sm font-medium transition hover:bg-accent dark:bg-card sm:w-auto xl:hidden"
      >
        Search
      </button>
      <label className="hidden text-[11px] font-medium text-muted-foreground xl:block">
        Booking date
        <input name="bookingDate" type="date" defaultValue={bookingDate} aria-label="Filter booking date" onChange={(event) => event.currentTarget.form?.requestSubmit()} className="mt-1 h-9 w-full rounded-lg border border-input bg-white px-2 text-sm font-normal text-foreground dark:bg-card" />
      </label>
      <label className="hidden text-[11px] font-medium text-muted-foreground xl:block">
        Event date
        <input name="eventDate" type="date" defaultValue={eventDate} aria-label="Filter event date" onChange={(event) => event.currentTarget.form?.requestSubmit()} className="mt-1 h-9 w-full rounded-lg border border-input bg-white px-2 text-sm font-normal text-foreground dark:bg-card" />
      </label>
      <select name="sort" defaultValue={sort} aria-label="Sort jobs" onChange={(event) => event.currentTarget.form?.requestSubmit()} className="hidden h-10 rounded-lg border border-input bg-white px-3 text-sm dark:bg-card xl:block">
        <option value="booking">Booking date · newest first</option>
        <option value="event">Event date · earliest first</option>
      </select>
    </form>
  );
}
