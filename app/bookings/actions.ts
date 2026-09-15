'use server';

import { requireUser } from '@/lib/auth/session';
import { withUserContext } from '@/lib/db/client';
import { assertStaffPortalWriteAccess } from '@/lib/staff-portal/write-access';
import { notifyBookingConfirmed, notifyPaymentReceived, maybeNotifyThankYou } from '@/lib/whatsapp/notify';

type UpdateBookingDetailsPayload = {
  customer_id: number;
  assigned_staff_id: string;
  event_name: string;
  event_date: string;
  event_time: string;
  event_location: string;
  contact_name: string;
  alternate_mobile: string;
  pickup_date: string;
  due_date: string;
  notes: string;
  items: {
    item_name: string;
    quantity: number;
    unit_price: number;
    security_deposit: number;
    product_id?: number;
    package_id?: number;
    package_variant_id?: number;
  }[];
  discount: number;
  tax: number;
};

export async function updateBookingDetailsAction(
  bookingId: number,
  payload: UpdateBookingDetailsPayload,
): Promise<{ error: string }> {
  try {
    await assertStaffPortalWriteAccess('bookings');
    const user = await requireUser();
    await withUserContext(user.id, (tx) =>
      tx`select * from public.update_booking_details(
        ${bookingId},
        ${tx.json(payload as never)}::jsonb
      )`,
    );
    return { error: '' };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unable to update the booking.' };
  }
}

type UpdateBookingFieldsPayload = {
  customer_id: number;
  assigned_staff_id: number | null;
  event_name: string;
  event_date: string;
  event_time: string | null;
  event_location: string | null;
  contact_name: string | null;
  alternate_mobile: string | null;
  pickup_date: string | null;
  due_date: string | null;
  notes: string | null;
};

type CreateBookingItemPayload = {
  item_name: string;
  quantity: number;
  unit_price: number;
  security_deposit: number;
  product_id?: number | null;
  package_id?: number | null;
  package_variant_id?: number | null;
};

type CreateBookingPayload = Record<string, unknown> & {
  items: CreateBookingItemPayload[];
};

type CreateBookingResult = {
  id: number | null;
  bookingNumber: string | null;
  error: string;
  stage: 'auth' | 'inventory' | 'booking' | 'date' | '';
};

export async function createBookingAction(
  payload: CreateBookingPayload,
  options: { quote: boolean; bookingDate?: string | null },
): Promise<CreateBookingResult> {
  let user: { id: string };
  try {
    user = await requireUser();
    await assertStaffPortalWriteAccess('bookings');
  } catch {
    return {
      id: null,
      bookingNumber: null,
      error: 'Please sign in again before creating a booking.',
      stage: 'auth',
    };
  }

  // Validate the client selection again on the server. Custom rows are saved
  // under the booking owner; package variants already belong to the package
  // catalogue and must not be converted into inventory products.
  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    return {
      id: null,
      bookingNumber: null,
      error: 'Add at least one product or package before creating the order.',
      stage: 'booking',
    };
  }

  const items = payload.items.map((item) => ({
    ...item,
    item_name: String(item.item_name ?? '').trim(),
    quantity: Math.max(0, Math.floor(Number(item.quantity) || 0)),
    unit_price: Math.max(0, Number(item.unit_price) || 0),
    security_deposit: Math.max(0, Number(item.security_deposit) || 0),
  }));
  const invalidItem = items.find(
    (item) => item.item_name.length < 2 || item.quantity < 1,
  );
  if (invalidItem) {
    return {
      id: null,
      bookingNumber: null,
      error: 'Every selected product or package needs a name and quantity of at least 1.',
      stage: 'booking',
    };
  }

  for (const item of items) {
    if (!item.product_id && !item.package_id && !item.package_variant_id) {
      try {
        const [inventoryProduct] = await withUserContext(user.id, async (tx) => {
          const [context] = await tx<{ owner_id: string | null }[]>`
            select public.current_booking_owner() as owner_id
          `;
          if (!context?.owner_id) throw new Error('You do not have access to create booking products.');
          return tx<{ id: number }[]>`
            insert into public.products (owner_id, name, sale_price, rental_price, security_deposit, stock_quantity, is_active)
            values (${context.owner_id}, ${item.item_name}, ${item.unit_price}, ${item.unit_price}, ${item.security_deposit}, 0, true)
            returning id
          `;
        });
        if (!inventoryProduct) throw new Error('Please try again.');
        item.product_id = inventoryProduct.id;
      } catch (error) {
        return {
          id: null,
          bookingNumber: null,
          error: error instanceof Error ? error.message : 'Please try again.',
          stage: 'inventory',
        };
      }
    }
  }

  const finalPayload = { ...payload, items };
  let bookingId: number;
  let bookingNumber: string;
  try {
    const rows = await withUserContext(user.id, (tx) =>
      options.quote
        ? tx<{ id: number; booking_number: string }[]>`
            select * from public.create_booking_quote(${tx.json(finalPayload as never)}::jsonb)
          `
        : tx<{ id: number; booking_number: string }[]>`
            select * from public.create_booking(${tx.json(finalPayload as never)}::jsonb)
          `,
    );
    const created = rows[0];
    if (!created) throw new Error('The booking was not saved.');
    bookingId = Number(created.id);
    bookingNumber = created.booking_number;
  } catch (error) {
    return {
      id: null,
      bookingNumber: null,
      error: error instanceof Error ? error.message : 'Please try again.',
      stage: 'booking',
    };
  }

  if (typeof options.bookingDate === 'string' && options.bookingDate) {
    try {
      await withUserContext(user.id, (tx) => tx`
        update public.bookings set created_at = ${`${options.bookingDate}T12:00:00+05:30`}
        where id = ${bookingId}
        returning id
      `);
    } catch (error) {
      return {
        id: bookingId,
        bookingNumber,
        error: error instanceof Error ? error.message : 'Please try again.',
        stage: 'date',
      };
    }
  }

  // Fire the WhatsApp "booking confirmed" + invoice messages for real sale
  // bookings (quotes never carry a 'confirmed' status, so notifyBookingConfirmed
  // would no-op for them anyway). Never allowed to fail booking creation.
  if (!options.quote) {
    await notifyBookingConfirmed(bookingId).catch(() => {});
  }

  return { id: bookingId, bookingNumber, error: '', stage: '' };
}

export async function createBookingCustomerAction(
  ownerId: string,
  input: { name: string; phone: string; address: string },
): Promise<{ data: { id: number; name: string; phone: string; email: string | null; address: string | null } | null; error: string }> {
  try {
    await assertStaffPortalWriteAccess('bookings');
    const user = await requireUser();
    const [customer] = await withUserContext(user.id, (tx) => tx<
      { id: number; name: string; phone: string; email: string | null; address: string | null }[]
    >`
      insert into public.customers (owner_id, name, phone, email, address, notes)
      values (${ownerId}, ${input.name}, ${input.phone}, null, ${input.address || null}, null)
      returning id, name, phone, email, address
    `);
    return { data: customer ?? null, error: '' };
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    if (code === '23505') return { data: null, error: 'A customer with this phone number already exists.' };
    return { data: null, error: error instanceof Error ? error.message : 'Unable to save the customer.' };
  }
}

export async function recordBookingPaymentAction(
  bookingId: number,
  input: { amount: number; method: string; reference: string | null },
): Promise<{ error: string }> {
  try {
    await assertStaffPortalWriteAccess('bookings');
    const user = await requireUser();
    await withUserContext(user.id, (tx) =>
      tx.unsafe(`select * from public.record_booking_payment($1, $2, $3, $4)`, [
        bookingId,
        input.amount,
        input.method,
        input.reference,
      ]),
    );
    await notifyPaymentReceived(bookingId, input.amount).catch(() => {});
    return { error: '' };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Payment could not be recorded.' };
  }
}

export async function processRentalReturnAction(
  bookingId: number,
  input: { damage: number; late: number; condition: string | null },
): Promise<{ error: string }> {
  try {
    await assertStaffPortalWriteAccess('bookings');
    const user = await requireUser();
    await withUserContext(user.id, (tx) =>
      tx.unsafe(`select * from public.process_rental_return($1, $2, $3, $4)`, [
        bookingId,
        input.damage,
        input.late,
        input.condition,
      ]),
    );
    await maybeNotifyThankYou(bookingId).catch(() => {});
    return { error: '' };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'The return could not be processed.' };
  }
}

export async function updateBookingFieldsAction(
  bookingId: number,
  fields: UpdateBookingFieldsPayload,
): Promise<{ error: string }> {
  try {
    await assertStaffPortalWriteAccess('bookings');
    const user = await requireUser();
    await withUserContext(user.id, (tx) =>
      tx`
        update public.bookings set
          customer_id = ${fields.customer_id},
          assigned_staff_id = ${fields.assigned_staff_id},
          event_name = ${fields.event_name},
          event_date = ${fields.event_date},
          event_time = ${fields.event_time},
          event_location = ${fields.event_location},
          contact_name = ${fields.contact_name},
          alternate_mobile = ${fields.alternate_mobile},
          pickup_date = ${fields.pickup_date},
          due_date = ${fields.due_date},
          notes = ${fields.notes},
          updated_at = now()
        where id = ${bookingId}
        returning id
      `,
    );
    return { error: '' };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unable to update the booking.' };
  }
}
