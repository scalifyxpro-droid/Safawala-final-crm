// Shared helpers for parsing "sale modification" requests out of a
// booking's notes field. The Modifications queue and the calendar day
// popup both need this, so it lives here instead of being duplicated.

export const MODIFICATION_MARKER = 'SALE MODIFICATION REQUIRED';

export type ModificationDetails = {
  type: string;
  instructions: string;
  scheduledDate: string;
  scheduledTime: string;
  productFittings: { product: string; hatSize: string; pickupDate: string }[];
};

export function modificationDetails(notes: string | null): ModificationDetails {
  const block = notes?.split(MODIFICATION_MARKER)[1] ?? '';
  const type = block.match(/Type:\s*([^\n]+)/)?.[1]?.trim() || 'Other';
  const instructions =
    block.match(/Details:\s*([\s\S]*?)(?:\nProduct fitting:|\nModification date:|\nModification time:|$)/)?.[1]?.trim() ||
    'Modification instructions were not added.';
  const scheduledDate =
    block.match(/Modification date:\s*([^\n]+)/)?.[1]?.trim() || '';
  const scheduledTime =
    block.match(/Modification time:\s*([^\n]+)/)?.[1]?.trim() || '';
  const productFittings: ModificationDetails['productFittings'] = [];
  for (const line of block.split('\n')) {
    if (!line.startsWith('Product fitting: ')) continue;
    try {
      const value = JSON.parse(line.slice('Product fitting: '.length));
      if (typeof value.product === 'string' && typeof value.hatSize === 'string' && typeof value.pickupDate === 'string') {
        productFittings.push(value);
      }
    } catch { /* Older free-form notes remain readable. */ }
  }
  return { type, instructions, scheduledDate, scheduledTime, productFittings };
}

export function validateModificationFittings(notes: string | null, items: { item_name: string }[]) {
  if (!hasModificationRequest(notes)) return;
  const fittings = modificationDetails(notes).productFittings;
  if (fittings.length !== items.length || fittings.some((fitting, index) =>
    fitting.product !== items[index].item_name || !fitting.hatSize.trim() || fitting.hatSize.length > 80 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(fitting.pickupDate) ||
    !Number.isFinite(Date.parse(fitting.pickupDate)) ||
    new Date(fitting.pickupDate).toISOString().slice(0, 10) !== fitting.pickupDate
  )) throw new Error('Enter a hat size and valid pickup date for every modification product.');
}

export function hasModificationRequest(notes: string | null) {
  return Boolean(notes?.includes(MODIFICATION_MARKER));
}
