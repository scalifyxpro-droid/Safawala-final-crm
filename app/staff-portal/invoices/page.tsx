import { IndianRupee } from 'lucide-react';
import { StaffRecordPage } from '@/components/staff-portal/staff-record-page';
import { Card, CardContent } from '@/components/ui/card';
import { friendlyDate, money } from '@/lib/bookings';
import { requirePermission } from '@/lib/staff-portal/guard';
import { withServiceRole, type DbParameter } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

type InvoiceRow = {
  id: number;
  booking_number: string;
  event_name: string;
  event_date: string;
  total: number;
  payment_status: string;
};

export default async function InvoicesPage() {
  const session = await requirePermission('invoices');

  const { invoices, error } = await withServiceRole(async (tx) => {
    try {
      const staffRows = await tx<{ owner_id: string }[]>`
        select owner_id from public.staff_members where id = ${session.staffMemberId}
      `;
      const ownerId = staffRows[0]?.owner_id ?? session.id;
      const conditions = [
        `owner_id = $1`,
        `is_quote = false`,
        `status not in ('draft','cancelled')`,
      ];
      const params: DbParameter[] = [ownerId];
      if (!session.isMainId) {
        params.push(session.staffMemberId);
        conditions.push(`assigned_staff_id = $${params.length}`);
      }
      const rows = await tx.unsafe(
        `select id, booking_number, event_name, event_date, total, payment_status
         from public.bookings
         where ${conditions.join(' and ')}
         order by created_at desc, id desc
         limit 100`,
        params,
      );
      return { invoices: rows as unknown as InvoiceRow[], error: null as Error | null };
    } catch (queryError) {
      return {
        invoices: [] as InvoiceRow[],
        error: queryError instanceof Error ? queryError : new Error('Unable to load invoices.'),
      };
    }
  });

  return (
    <StaffRecordPage
      session={session}
      title="My Invoices"
      subtitle="Booking invoices available to your account"
      icon={<IndianRupee />}
      heading="No invoices available"
      description="Invoices for assigned confirmed bookings will appear here."
    >
      <Card className="overflow-hidden border-border py-0 shadow-level-1">
        <CardContent className="p-0">
          {error ? (
            <p className="p-5 text-sm text-destructive">{error.message}</p>
          ) : invoices?.length ? (
            <div className="divide-y divide-border">
              {invoices.map((invoice) => (
                <div
                  key={invoice.id}
                  className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-semibold text-primary">{invoice.booking_number}</p>
                    <p className="text-sm text-muted-foreground">
                      {invoice.event_name} · {friendlyDate(invoice.event_date)}
                    </p>
                  </div>
                  <div className="sm:text-right">
                    <p className="font-semibold">{money(Number(invoice.total))}</p>
                    <p className="text-xs capitalize text-muted-foreground">
                      {invoice.payment_status}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid min-h-52 place-items-center p-8 text-center">
              <div>
                <IndianRupee className="mx-auto size-9 text-primary" />
                <h3 className="mt-3 font-semibold">No invoices available</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Invoices for assigned confirmed bookings will appear here.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </StaffRecordPage>
  );
}
