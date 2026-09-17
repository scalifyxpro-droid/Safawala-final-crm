import type { StaffDepartment } from '@/lib/staff-portal/constants';
import type { EventJobStage, StylistExecutionEntry } from './types';

export const EVENT_JOB_STAGE_KEYS = [
  'warehouse_pick',
  'stylist_opportunity',
  'quality_check',
  'packing',
  'collection',
  'return_quality_check',
  'return_warehouse',
  'booking_final_check',
] as const;

export type EventJobStageKey = (typeof EVENT_JOB_STAGE_KEYS)[number];

export type EventJobStageStatus =
  | 'not_started'
  | 'open'
  | 'in_progress'
  | 'done'
  | 'blocked';

// Which staff-portal department owns each stage. 'stylist_opportunity' is where any
// stylist can express interest; the admin-only approval step comes in a later build
// step and does not need its own department here.
export const STAGE_DEPARTMENT: Record<EventJobStageKey, StaffDepartment> = {
  warehouse_pick: 'warehouse',
  stylist_opportunity: 'stylist',
  quality_check: 'qc',
  packing: 'qc',
  collection: 'collection',
  return_quality_check: 'qc',
  return_warehouse: 'warehouse',
  booking_final_check: 'booking',
};

export const STAGE_LABEL: Record<EventJobStageKey, string> = {
  warehouse_pick: 'Warehouse',
  stylist_opportunity: 'Stylist',
  quality_check: 'QC & packing',
  packing: 'QC & packing',
  collection: 'Collection',
  return_quality_check: 'Return QC',
  return_warehouse: 'Return warehouse',
  booking_final_check: 'Booking close',
};

export type TrackingStage = {
  key: string;
  status: EventJobStageStatus;
};

export const TRACKING_STAGE_LABEL: Record<string, string> = {
  booking_done: 'Booking done',
  warehouse_pick: 'Warehouse',
  qc_packing: 'QC & packing',
  stylist_opportunity: 'Stylist',
  travel: 'Travel',
  live_event: 'Live event',
  collection: 'Collection',
  return_quality_check: 'Return QC',
  return_warehouse: 'Return warehouse',
  booking_final_check: 'Booking close',
};

/** Display-only tracker sequence shared by admin and staff job views. */
export function trackingTimeline(
  stages: EventJobStage[],
  stylistExecutions: StylistExecutionEntry[] = [],
  completed = false,
): TrackingStage[] {
  const find = (key: EventJobStageKey) => stages.find((stage) => stage.key === key);
  const workCompleted = stylistExecutions.some((entry) => entry.status === 'work_completed');
  const eventLive = stylistExecutions.some((entry) => entry.status === 'reached_venue' || entry.status === 'work_started');
  const jobClosed = completed || find('booking_final_check')?.status === 'done';
  const combine = (first: EventJobStage | undefined, second: EventJobStage | undefined): EventJobStageStatus => {
    if (first?.status === 'in_progress' || second?.status === 'in_progress') return 'in_progress';
    if (first?.status === 'open' || second?.status === 'open') return 'open';
    if (first?.status === 'done' && second?.status === 'done') return 'done';
    return 'not_started';
  };
  const timeline: TrackingStage[] = [
    { key: 'booking_done', status: 'done' },
    { key: 'warehouse_pick', status: find('warehouse_pick')?.status ?? 'not_started' },
    { key: 'qc_packing', status: combine(find('quality_check'), find('packing')) },
    { key: 'stylist_opportunity', status: find('stylist_opportunity')?.status ?? 'not_started' },
    { key: 'travel', status: eventLive || workCompleted ? 'done' : 'not_started' },
    { key: 'live_event', status: workCompleted ? 'done' : eventLive ? 'in_progress' : 'not_started' },
    { key: 'collection', status: workCompleted ? find('collection')?.status ?? 'not_started' : 'not_started' },
    { key: 'return_quality_check', status: find('return_quality_check')?.status ?? 'not_started' },
    { key: 'return_warehouse', status: find('return_warehouse')?.status ?? 'not_started' },
    { key: 'booking_final_check', status: find('booking_final_check')?.status ?? 'not_started' },
  ];
  // Final closure is authoritative: a closed job must never leave an earlier
  // display-only tracker step looking incomplete on staff or customer views.
  return jobClosed
    ? timeline.map((stage) => ({ ...stage, status: 'done' as const }))
    : timeline;
}

// Stages that open together the moment a Central Event Job is created — everything
// else starts 'not_started' until its predecessor stage completes.
export const INITIAL_OPEN_STAGES: EventJobStageKey[] = [
  'warehouse_pick',
  'stylist_opportunity',
];

/** Keep every tracker display in the business-defined workflow order. */
export function orderEventJobStages<T extends { key: EventJobStageKey }>(
  stages: T[],
) {
  const order = new Map<EventJobStageKey, number>(
    EVENT_JOB_STAGE_KEYS.map((key, index) => [key, index]),
  );
  return [...stages].sort(
    (first, second) =>
      (order.get(first.key) ?? Number.MAX_SAFE_INTEGER) -
      (order.get(second.key) ?? Number.MAX_SAFE_INTEGER),
  );
}
