'use server';

import { requireUser } from '@/lib/auth/session';
import { withUserContext } from '@/lib/db/client';

export type CustomerRecord = {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type SaveCustomerInput = {
  id?: number;
  name: string;
  phone: string;
  address: string | null;
  email: string | null;
  notes: string | null;
};

export async function saveCustomerAction(
  input: SaveCustomerInput,
): Promise<{ data: CustomerRecord | null; error: string }> {
  const user = await requireUser();
  try {
    const record = await withUserContext(user.id, async (tx) => {
      if (input.id) {
        const [row] = await tx<CustomerRecord[]>`
          update public.customers
          set name = ${input.name}, phone = ${input.phone}, address = ${input.address}, updated_at = now()
          where id = ${input.id}
          returning id, name, phone, email, address, notes, created_at, updated_at
        `;
        return row ?? null;
      }
      const [row] = await tx<CustomerRecord[]>`
        insert into public.customers (owner_id, name, phone, address, email, notes)
        values (${user.id}, ${input.name}, ${input.phone}, ${input.address}, ${input.email}, ${input.notes})
        returning id, name, phone, email, address, notes, created_at, updated_at
      `;
      return row ?? null;
    });
    return { data: record, error: '' };
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    if (code === '23505') {
      return { data: null, error: 'A customer with this phone number already exists.' };
    }
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Customer could not be saved.',
    };
  }
}
