'use server';

import { requireUser } from '@/lib/auth/session';
import { withUserContext } from '@/lib/db/client';

export type PackageVariant = {
  id: number;
  category_id: number;
  name: string;
  base_price: number;
  inclusions: string[];
  extra_safa_price: number;
  missing_safa_penalty: number;
  security_deposit: number;
  created_at: string;
  updated_at: string;
};

export type PackageCategoryRow = {
  id: number;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

function isUniqueViolation(error: unknown) {
  return (error as { code?: string } | null)?.code === '23505';
}

export async function createPackageCategoryAction(
  name: string,
): Promise<{ data: PackageCategoryRow | null; error: string }> {
  try {
    const user = await requireUser();
    const record = await withUserContext(user.id, async (tx) => {
      const [row] = await tx<PackageCategoryRow[]>`
        insert into public.package_categories (owner_id, name, is_active)
        values (${user.id}, ${name}, true)
        returning id, name, is_active, created_at, updated_at
      `;
      return row ?? null;
    });
    return { data: record, error: '' };
  } catch (error) {
    if (isUniqueViolation(error)) return { data: null, error: 'This category already exists.' };
    return { data: null, error: 'The category could not be created. Please try again.' };
  }
}

export type SaveVariantInput = {
  id?: number;
  categoryId: number;
  name: string;
  basePrice: number;
  inclusions: string[];
  extraSafaPrice: number;
  missingSafaPenalty: number;
  securityDeposit: number;
};

export async function savePackageVariantAction(
  input: SaveVariantInput,
): Promise<{ data: PackageVariant | null; error: string }> {
  try {
    const user = await requireUser();
    const record = await withUserContext(user.id, async (tx) => {
      if (input.id) {
        const [row] = await tx<PackageVariant[]>`
          update public.package_variants
          set name = ${input.name}, base_price = ${input.basePrice},
            inclusions = ${tx.array(input.inclusions)},
            extra_safa_price = ${input.extraSafaPrice},
            missing_safa_penalty = ${input.missingSafaPenalty},
            security_deposit = ${input.securityDeposit},
            updated_at = now()
          where id = ${input.id} and category_id = ${input.categoryId}
          returning id, category_id, name, base_price, inclusions, extra_safa_price, missing_safa_penalty, security_deposit, created_at, updated_at
        `;
        return row ?? null;
      }
      const [row] = await tx<PackageVariant[]>`
        insert into public.package_variants (
          owner_id, category_id, name, base_price, inclusions,
          extra_safa_price, missing_safa_penalty, security_deposit
        ) values (
          ${user.id}, ${input.categoryId}, ${input.name}, ${input.basePrice}, ${tx.array(input.inclusions)},
          ${input.extraSafaPrice}, ${input.missingSafaPenalty}, ${input.securityDeposit}
        )
        returning id, category_id, name, base_price, inclusions, extra_safa_price, missing_safa_penalty, security_deposit, created_at, updated_at
      `;
      return row ?? null;
    });
    return { data: record, error: '' };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { data: null, error: 'A variant with this name already exists in this category.' };
    }
    return { data: null, error: 'The variant could not be saved. Please try again.' };
  }
}

export async function deletePackageVariantAction(
  variantId: number,
): Promise<{ error: string }> {
  try {
    const user = await requireUser();
    await withUserContext(user.id, (tx) => tx`
      delete from public.package_variants where id = ${variantId}
    `);
    return { error: '' };
  } catch {
    return { error: 'The variant could not be deleted. Please try again.' };
  }
}
