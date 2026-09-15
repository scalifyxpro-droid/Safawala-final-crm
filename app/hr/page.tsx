import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Banknote, BriefcaseBusiness, CalendarDays, FileText, ShieldCheck, UsersRound } from 'lucide-react';
import { DashboardShell } from '@/components/layout/dashboard-shell';
import { DashboardHeader } from '@/components/layout/dashboard-header';
import { Card, CardContent } from '@/components/ui/card';
import { getCurrentUser } from '@/lib/auth/session';
import { withUserContext } from '@/lib/db/client';

const cards = [
  { href: '/staff', label: 'Staff Directory', description: 'Manage employees, roles, departments, and portal access.', icon: UsersRound, live: true },
  { href: '/hr/attendance', label: 'Attendance', description: 'Track daily presence, hours, leave, and overtime.', icon: CalendarDays, live: true },
  { href: '/hr/payroll', label: 'Payroll', description: 'Manage salary breakdowns, deductions, and payslips.', icon: Banknote, live: true },
  { href: '/hr/letters', label: 'HR Letters', description: 'Create offer, appointment, experience, and other letters.', icon: FileText, live: true },
  { href: '/hr/kyc', label: 'KYC & Documents', description: 'Review staff identity documents and verification status.', icon: ShieldCheck, live: true },
  { href: '/hr/work-orders', label: 'Work Orders', description: 'Monitor department tasks and operational assignments.', icon: BriefcaseBusiness, live: true },
];

export default async function HrDashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  let count = 0;
  let loadError = '';
  try {
    const [summary] = await withUserContext(user.id, (tx) => tx<{ count: number }[]>`
      select count(*)::int as count from public.staff_members
    `);
    count = Number(summary?.count ?? 0);
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Unable to load the staff summary.';
  }
  return <DashboardShell email={user.email ?? 'Safawala user'}><div className="mx-auto max-w-[1280px] space-y-6"><DashboardHeader title="HR & Staff" subtitle="Manage your team, attendance, payroll, and employee records" backHref="/dashboard" />{loadError ? <Card className="border-[#e4d2b6] bg-[#fffaf2] dark:bg-[#241e17]"><CardContent className="p-5"><p className="font-semibold text-[#70481c]">Staff summary is temporarily unavailable</p><p className="mt-1 text-sm text-muted-foreground">The HR tools are still available below. {loadError}</p></CardContent></Card> : null}<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Card><CardContent className="p-5"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total staff</p><p className="mt-2 text-3xl font-semibold">{count}</p><p className="mt-1 text-sm text-muted-foreground">Registered employee records</p></CardContent></Card><Card><CardContent className="p-5"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Admin control</p><p className="mt-2 text-lg font-semibold">Access & roles</p><p className="mt-1 text-sm text-muted-foreground">Managed from Staff Directory</p></CardContent></Card></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{cards.map(({ href, label, description, icon: Icon, live }) => { const content = <Card className={`h-full ${live ? 'transition hover:-translate-y-0.5 hover:border-[#d6b98d] hover:shadow-level-2' : 'opacity-75'}`}><CardContent className="flex h-full gap-4 p-5"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#f5ead8] dark:bg-[#33291c] text-[#70481c]"><Icon className="size-5" /></span><span><strong className="block">{label}</strong><span className="mt-1 block text-sm text-muted-foreground">{description}</span><span className={`mt-3 inline-block text-xs font-medium ${live ? 'text-[#70481c]' : 'text-muted-foreground'}`}>{live ? 'Open module →' : 'Planned module'}</span></span></CardContent></Card>; return live ? <Link key={label} href={href} className="group">{content}</Link> : <div key={label}>{content}</div>; })}</div></div></DashboardShell>;
}
