import type { EventJob } from './types';

type SortableEventJob = Pick<
  EventJob,
  'bookingId' | 'bookingNumber' | 'createdAt' | 'eventSummary'
>;

const UNSCHEDULED_DATE = '9999-12-31';
const UNSCHEDULED_TIME = '99:99:99';

function compareText(first: string, second: string) {
  return first.localeCompare(second);
}

/**
 * Standard booking order used by every operational portal:
 * event date, event time, database booking ID, then booking number.
 */
export function compareJobsByEventSchedule(
  first: SortableEventJob,
  second: SortableEventJob,
) {
  const dateOrder = compareText(
    first.eventSummary.eventDate || UNSCHEDULED_DATE,
    second.eventSummary.eventDate || UNSCHEDULED_DATE,
  );
  if (dateOrder !== 0) return dateOrder;

  const timeOrder = compareText(
    first.eventSummary.eventTime || UNSCHEDULED_TIME,
    second.eventSummary.eventTime || UNSCHEDULED_TIME,
  );
  if (timeOrder !== 0) return timeOrder;

  const idOrder = Number(first.bookingId) - Number(second.bookingId);
  if (idOrder !== 0) return idOrder;

  return first.bookingNumber.localeCompare(second.bookingNumber, undefined, {
    numeric: true,
  });
}

export function compareJobsByBookingDate(
  first: SortableEventJob,
  second: SortableEventJob,
) {
  const createdOrder = compareText(first.createdAt, second.createdAt);
  return createdOrder !== 0
    ? createdOrder
    : compareJobsByEventSchedule(first, second);
}

export function sortJobsByEventSchedule<T extends SortableEventJob>(
  jobs: readonly T[],
) {
  return [...jobs].sort(compareJobsByEventSchedule);
}
