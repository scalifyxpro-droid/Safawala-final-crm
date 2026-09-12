'use server';

import { requireUser } from '@/lib/auth/session';
import { withUserContext } from '@/lib/db/client';

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
    const user = await requireUser();
    await withUserContext(user.id, (tx) =>
      tx.unsafe(`select * from public.update_booking_details($1, $2)`, [
        bookingId,
        JSON.stringify(payload),
      ]),
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
  } catch {
    return {
      id: null,
      bookingNumber: null,
      error: 'Please sign in again before creating a booking.',
      stage: 'auth',
    };
  }

  // RLS requires newly-created inventory rows to belong to the authenticated
  // user. The booking RPC applies its own caller ownership separately.
  const items = payload.items.map((item) => ({ ...item }));
  for (const item of items) {
    if (!item.product_id && !item.package_id) {
      try {
        const [inventoryProduct] = await withUserContext(user.id, (tx) => tx<{ id: number }[]>`
          insert into public.products (owner_id, name, sale_price, rental_price, security_deposit, stock_quantity, is_active)
          values (${user.id}, ${item.item_name.trim()}, ${item.unit_price}, ${item.unit_price}, ${item.security_deposit}, 0, true)
          returning id
        `);
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
      tx.unsafe(
        `select * from public.${options.quote ? 'create_booking_quote' : 'create_booking'}($1)`,
        [JSON.stringify(finalPayload)],
      ),
    );
    const created = (rows as unknown as { id: number; booking_number: string }[])[0];
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

  return { id: bookingId, bookingNumber, error: '', stage: '' };
}

export async function createBookingCustomerAction(
  ownerId: string,
  input: { name: string; phone: string; address: string },
): Promise<{ data: { id: number; name: string; phone: string; email: string | null; address: string | null } | null; error: string }> {
  try {
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
    const user = await requireUser();
    await withUserContext(user.id, (tx) =>
      tx.unsafe(`select * from public.record_booking_payment($1, $2, $3, $4)`, [
        bookingId,
        input.amount,
        input.method,
        input.reference,
      ]),
    );
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
    const user = await requireUser();
    await withUserContext(user.id, (tx) =>
      tx.unsafe(`select * from public.process_rental_return($1, $2, $3, $4)`, [
        bookingId,
        input.damage,
        input.late,
        input.condition,
      ]),
    );
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
