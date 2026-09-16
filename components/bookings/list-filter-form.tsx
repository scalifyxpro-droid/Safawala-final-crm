'use client';

import {
  useCallback,
  useEffect,
  useState,
  useTransition,
  type SyntheticEvent,
} from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export type ListFilterDefinition = {
  name: string;
  label: string;
  value: string;
  options: [string, string][];
};

export function ListFilterForm({
  search,
  searchPlaceholder,
  filters,
  mobileSearchOnly = false,
}: {
  search: string;
  searchPlaceholder: string;
  filters: ListFilterDefinition[];
  mobileSearchOnly?: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [searchValue, setSearchValue] = useState(search);
  const activeFilters = filters.flatMap((filter) => {
    if (!filter.value) return [];
    const selected = filter.options.find(([key]) => key === filter.value);
    return selected ? [{ name: filter.name, text: selected[1] }] : [];
  });
  const hasActiveFilters = Boolean(search || activeFilters.length);

  const navigate = useCallback((params: URLSearchParams, replace = false) => {
    params.delete('page');
    const query = params.toString();
    const href = query ? `${pathname}?${query}` : pathname;
    startTransition(() => (replace ? router.replace(href) : router.push(href)));
  }, [pathname, router]);

  useEffect(() => setSearchValue(search), [search]);

  function changeFilter(name: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(name, value);
    else params.delete(name);
    navigate(params);
  }

  function submitSearch(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    // Secondary filters are not visible at responsive widths. Clear stale
    // desktop selections so a mobile search is never silently constrained.
    if (mobileSearchOnly && window.matchMedia('(max-width: 1279px)').matches) {
      filters.forEach(({ name }) => params.delete(name));
    }
    const value = searchValue.trim();
    if (value) params.set('q', value);
    else params.delete('q');
    navigate(params);
  }

  function resetFilters() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('q');
    filters.forEach(({ name }) => params.delete(name));
    navigate(params);
  }

  return (
    <form
      onSubmit={submitSearch}
      className={`grid gap-3 border-b bg-[#fcfaf7] p-4 dark:bg-[#241e17] ${mobileSearchOnly ? 'sm:grid-cols-[minmax(0,1fr)_auto] xl:grid-cols-[minmax(220px,1fr)_repeat(2,170px)_auto]' : 'lg:grid-cols-[minmax(220px,1fr)_repeat(2,170px)_auto]'}`}
      aria-busy={pending}
    >
      <label className="relative">
        <span className="sr-only">{searchPlaceholder}</span>
        <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
        <input
          name="q"
          value={searchValue}
          onChange={(event) => setSearchValue(event.target.value)}
          placeholder={searchPlaceholder}
          className="h-10 w-full rounded-lg border bg-white dark:bg-card pl-9 pr-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
        />
      </label>
      {filters.map((filter) => (
        <select
          key={filter.name}
          name={filter.name}
          value={filter.value}
          onChange={(event) => changeFilter(filter.name, event.target.value)}
          aria-label={filter.label}
          className={`${mobileSearchOnly ? 'hidden xl:block' : ''} h-10 rounded-lg border bg-white px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 dark:bg-card`}
        >
          <option value="">{filter.label}</option>
          {filter.options.map(([key, text]) => (
            <option key={key} value={key}>
              {text}
            </option>
          ))}
        </select>
      ))}
      <Button type="submit" variant="outline" className={`${mobileSearchOnly ? 'w-full sm:w-auto' : ''} h-10 bg-white px-6 dark:bg-card`} disabled={pending}>
        Search
      </Button>
      {hasActiveFilters ? (
        <div className={`${mobileSearchOnly ? 'hidden xl:flex' : 'flex'} flex-wrap items-center gap-2 lg:col-span-full`} aria-live="polite">
          <span className="text-xs font-medium text-muted-foreground">Active filters:</span>
          {search ? (
            <span className="inline-flex h-7 items-center rounded-full border border-[#e4d2b6] bg-white dark:bg-card px-2.5 text-xs font-medium text-[#70481c]">
              Search: {search}
            </span>
          ) : null}
          {activeFilters.map((filter) => (
            <span
              key={filter.name}
              className="inline-flex h-7 items-center rounded-full border border-[#e4d2b6] bg-[#f5ead8] dark:bg-[#33291c] px-2.5 text-xs font-semibold text-[#70481c]"
            >
              {filter.text}
            </span>
          ))}
          <button
            type="button"
            onClick={resetFilters}
            disabled={pending}
            className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs font-medium text-muted-foreground transition hover:bg-white dark:hover:bg-card hover:text-foreground disabled:opacity-50"
          >
            <X className="size-3.5" />
            Clear filters
          </button>
        </div>
      ) : null}
    </form>
  );
}
