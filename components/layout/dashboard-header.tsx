'use client';

import { useContext, useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { DashboardHeaderContext } from './dashboard-header-context';

export function DashboardHeader({
  title,
  subtitle,
  actions,
  backHref,
}: {
  title: string;
  subtitle: string;
  actions?: ReactNode;
  backHref?: string | null;
}) {
  const setHeader = useContext(DashboardHeaderContext);
  useEffect(() => {
    if (!setHeader) return;
    setHeader({ title, subtitle, actions, backHref });
    return () => setHeader(null);
  }, [setHeader, title, subtitle, actions, backHref]);
  if (setHeader) return null;
  return (
    <div className="relative z-10 mb-5 flex min-w-0 flex-1 flex-wrap items-center gap-3 border-b border-border/80 py-1 print:hidden sm:flex-nowrap">
      {backHref ? <Link href={backHref} aria-label="Back" className="pointer-events-auto hidden size-9 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition hover:bg-[#f5ead8] hover:text-[#70481c] dark:hover:bg-[#33291c] dark:hover:text-[#f0d9ad] lg:grid"><ArrowLeft className="size-4" /></Link> : null}
      <div className={`min-w-0 flex-1 ${actions ? 'hidden sm:block' : ''}`}>
        <h1 className="truncate text-lg font-semibold leading-5 tracking-[-0.025em]">
          {title}
        </h1>
        <p className="mt-0.5 hidden truncate text-xs leading-4 text-muted-foreground sm:block">
          {subtitle}
        </p>
      </div>
      {actions ? (
        <div className="pointer-events-auto ml-auto flex min-w-0 max-w-full shrink items-center gap-2 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&_[data-slot=button]]:h-9 [&_[data-slot=button]]:min-w-9 [&_[data-slot=button]]:shrink-0 [&_[data-slot=button]]:rounded-lg [&_[data-slot=button]]:px-3 [&_[data-slot=button]]:text-sm">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
