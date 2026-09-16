import { CalendarClock, UserRound } from 'lucide-react';
import { DashboardHeader } from '@/components/layout/dashboard-header';
import { StaffPortalShell } from '@/components/staff-portal/staff-portal-shell';
import { Card, CardContent } from '@/components/ui/card';
import { friendlyDate, money } from '@/lib/bookings';
import { requirePermission } from '@/lib/staff-portal/guard';
import { withServiceRole, type DbParameter } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

type LeadRow = {
  id: number;
  booking_number: string;
  event_name: string;
  event_date: string;
  total: number;
  customers: { name: string; phone: string } | null;
};

export default async function StaffLeadsPage() {
  const session = await requirePermission('leads');

  const { leads, error } = await withServiceRole(async (tx) => {
    try {
      const staffRows = await tx<{ owner_id: string }[]>`
        select owner_id from public.staff_members where id = ${session.staffMemberId}
      `;
      const ownerId = staffRows[0]?.owner_id ?? session.id;
      const conditions = [`b.owner_id = $1`, `b.is_quote = true`, `b.status = 'draft'`];
      const params: DbParameter[] = [ownerId];
      if (!session.isMainId) {
        params.push(session.staffMemberId);
        conditions.push(`b.created_by_staff_id = $${params.length}`);
      }
      const rows = await tx.unsafe(
        `select
           b.id, b.booking_number, b.event_name, b.event_date, b.total,
           case when c.id is null then null else json_build_object('name', c.name, 'phone', c.phone) end as customers
         from public.bookings b
         left join public.customers c on c.id = b.customer_id
         where ${conditions.join(' and ')}
         order by b.event_date asc, b.id asc`,
        params,
      );
      return { leads: rows as unknown as LeadRow[], error: null as Error | null };
    } catch (queryError) {
      return {
        leads: [] as LeadRow[],
        error: queryError instanceof Error ? queryError : new Error('Unable to load leads.'),
      };
    }
  });

  return (
    <StaffPortalShell
      name={session.name}
      departments={session.departments}
      permissions={session.permissions}
      isMainId={session.isMainId}
    >
      <div className="mx-auto max-w-[1440px] space-y-6">
        <DashboardHeader title="My Leads" subtitle="Booking enquiries assigned to your department access" />
        <Card className="overflow-hidden border-border py-0 shadow-level-1">
          <CardContent className="p-0">
            {error ? (
              <p className="p-5 text-sm text-destructive">{error.message}</p>
            ) : leads?.length ? (
              <div className="divide-y divide-border">
                {leads.map((lead) => {
                  const customer = lead.customers;
                  return (
                    <div
                      key={lead.id}
                      className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="font-semibold text-primary">{lead.booking_number}</p>
                        <p className="mt-1 flex items-center gap-1.5 text-sm">
                          <UserRound className="size-4 text-muted-foreground" />
                          {customer?.name ?? 'Walk-in'}
                          {customer?.phone ? ` · ${customer.phone}` : ''}
                        </p>
                      </div>
                      <div className="sm:text-right">
                        <p className="font-semibold">{money(Number(lead.total))}</p>
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <CalendarClock className="size-3.5" />
                          {lead.event_name} · {friendlyDate(lead.event_date)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="grid min-h-52 place-items-center p-8 text-center">
                <div>
                  <UserRound className="mx-auto size-9 text-primary" />
                  <h3 className="mt-3 font-semibold">No assigned leads</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    New assigned booking enquiries will appear here.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </StaffPortalShell>
  );
}
