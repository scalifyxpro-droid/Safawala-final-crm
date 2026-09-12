import { redirect } from 'next/navigation';
import { BookingPortalShell } from '@/components/bookings/booking-portal-shell';
import { BookingForm } from '@/components/bookings/booking-form';
import { getCurrentUser } from '@/lib/auth/session';
import { withUserContext } from '@/lib/db/client';
import { getStaffSession } from '@/lib/staff-portal/session';

export const dynamic = 'force-dynamic';

export default async function NewBookingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const initialType = params.type === 'rental' ? 'rental' : params.type === 'sale' ? 'sale' : undefined;
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const [staffSession, data] = await Promise.all([
    getStaffSession(),
    withUserContext(user.id, async (tx) => {
      const staffAccountRows = await tx.unsafe(
        `select owner_id from public.staff_members where user_id = $1 limit 1`,
        [user.id],
      );
      const staffAccount = (staffAccountRows as unknown as { owner_id: string }[])[0] ?? null;

      const [customers, products, packages, packageCategories, staff] = (await Promise.all([
        tx.unsafe(`select id, name, phone, email, address from public.customers order by name`),
        tx.unsafe(
          `select id, sku, barcode, name, category, subcategory, sale_price, rental_price, security_deposit, stock_quantity, image_urls
           from public.products where is_active = true order by name`,
        ),
        tx.unsafe(
          `select id, name, sale_price, rental_price, security_deposit from public.packages where is_active = true order by name`,
        ),
        tx.unsafe(`
          select
            pc.id, pc.name,
            coalesce(variants.rows, '[]'::json) as package_variants
          from public.package_categories pc
          left join lateral (
            select json_agg(json_build_object(
              'id', pv.id,
              'name', pv.name,
              'base_price', pv.base_price,
              'inclusions', pv.inclusions,
              'extra_safa_price', pv.extra_safa_price,
              'missing_safa_penalty', pv.missing_safa_penalty,
              'security_deposit', pv.security_deposit
            )) as rows
            from public.package_variants pv where pv.category_id = pc.id
          ) variants on true
          where pc.is_active = true
          order by pc.name
        `),
        tx.unsafe(`select id, name from public.staff_members where is_active = true order by name`),
      ])) as unknown as [
        { id: number; name: string; phone: string; email: string | null; address: string | null }[],
        {
          id: number;
          sku: string | null;
          barcode: string | null;
          name: string;
          category: string | null;
          subcategory: string | null;
          sale_price: number;
          rental_price: number;
          security_deposit: number;
          stock_quantity: number;
          image_urls: string[];
        }[],
        { id: number; name: string; sale_price: number; rental_price: number; security_deposit: number }[],
        {
          id: number;
          name: string;
          package_variants: {
            id: number;
            name: string;
            base_price: number;
            inclusions: string[];
            extra_safa_price: number;
            missing_safa_penalty: number;
            security_deposit: number;
          }[];
        }[],
        { id: number; name: string }[],
      ];

      return { staffAccount, customers, products, packages, packageCategories, staff };
    }),
  ]);

  const bookingOwnerId = data.staffAccount?.owner_id ?? user.id;

  return (
    <BookingPortalShell email={user.email ?? 'Safawala user'}>
      <BookingForm
        ownerId={bookingOwnerId}
        customers={data.customers ?? []}
        products={data.products ?? []}
        packages={data.packages ?? []}
        rentalPackages={(data.packageCategories ?? []).flatMap((category) =>
          (category.package_variants ?? []).map((variant) => ({
            id: variant.id,
            name: variant.name,
            category_name: category.name,
            rental_price: Number(variant.base_price),
            extra_safa_price: Number(variant.extra_safa_price),
            missing_safa_penalty: Number(variant.missing_safa_penalty),
            security_deposit: Number(variant.security_deposit),
            inclusions: variant.inclusions ?? [],
          })),
        )}
        staff={data.staff ?? []}
        quoteOnly={staffSession?.accessType === 'staff'}
        initialType={initialType}
        quoteCreatorStaffId={
          staffSession?.accessType === 'staff'
            ? staffSession.staffMemberId
            : undefined
        }
      />
    </BookingPortalShell>
  );
}
