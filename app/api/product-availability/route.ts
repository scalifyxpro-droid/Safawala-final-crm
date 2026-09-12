import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import {
  getAvailabilityForWindow,
  findNextAvailableWindow,
} from '@/lib/inventory-availability';

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Your session has expired.' }, { status: 401 });
    }

    const body = await request.json();
    const ownerId = typeof body.ownerId === 'string' && body.ownerId ? body.ownerId : user.id;
    const pickupDate = String(body.pickupDate ?? '').trim();
    const dueDate = String(body.dueDate ?? '').trim();
    const productIds = Array.isArray(body.productIds)
      ? body.productIds.map((id: unknown) => Number(id)).filter((id: number) => Number.isFinite(id))
      : [];
    const excludeBookingId =
      body.excludeBookingId != null && Number.isFinite(Number(body.excludeBookingId))
        ? Number(body.excludeBookingId)
        : undefined;

    if (!pickupDate || !dueDate) {
      return NextResponse.json({ error: 'Pickup date and due date are required.' }, { status: 422 });
    }
    if (dueDate < pickupDate) {
      return NextResponse.json({ error: 'Due date cannot be before the pickup date.' }, { status: 422 });
    }

    const availabilityMap = await getAvailabilityForWindow({
      ownerId,
      productIds,
      pickupDate,
      dueDate,
      excludeBookingId,
    });
    const availability = Object.fromEntries(availabilityMap);

    let nextAvailable: { pickupDate: string; dueDate: string } | null | undefined;
    const checkQuantity = body.checkQuantity;
    if (
      checkQuantity &&
      Number.isFinite(Number(checkQuantity.productId)) &&
      Number.isFinite(Number(checkQuantity.quantity))
    ) {
      const productId = Number(checkQuantity.productId);
      const quantity = Number(checkQuantity.quantity);
      const current = availabilityMap.get(productId);
      if (!current || current.available < quantity) {
        nextAvailable = await findNextAvailableWindow({
          ownerId,
          productId,
          quantity,
          pickupDate,
          dueDate,
          excludeBookingId,
        });
      }
    }

    return NextResponse.json({ availability, nextAvailable });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to check availability.' },
      { status: 500 },
    );
  }
}
