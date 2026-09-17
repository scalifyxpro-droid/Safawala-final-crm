import 'server-only';

import { randomUUID } from 'node:crypto';
import { cache } from 'react';
import type { StaffDepartment } from '@/lib/staff-portal/constants';
import { notifyAccount, notifyDepartment } from '@/lib/notifications/store';
import { withServiceRole, type Tx } from '@/lib/db/client';
import {
  EVENT_JOB_STAGE_KEYS,
  INITIAL_OPEN_STAGES,
  STAGE_DEPARTMENT,
  STAGE_LABEL,
  type EventJobStageKey,
} from './constants';
import type {
  BookingFinalCheck,
  CollectionItemCheck,
  ConfirmedBookingSummary,
  EventJob,
  EventJobActivityEntry,
  EventJobIssue,
  EventJobStage,
  PackingChecklist,
  QcItemCheck,
  ReturnQcItemCheck,
  ReturnWarehouseItemResult,
  StylistAccommodation,
  StylistInterest,
  StylistInterestStatus,
  StylistExecutionStatus,
  StylistTravelLeg,
  WarehouseItemPrep,
} from './types';
import { sortJobsByBookingDate } from './sorting';

function normalizeJob(
  job: EventJob,
  bookingCreatedAt?: string | Date | null,
): EventJob {
  // PostgreSQL `bigint` values are returned as strings by the postgres driver.
  // Keep the application boundary numeric because the rest of the booking and
  // event-job domain models use `number` IDs. Without this normalization a
  // freshly-triggered job has bookingId "9", while owner maps are keyed by 9,
  // causing writeAll() to silently skip initialization of the job state.
  const bookingId = Number(job.bookingId);
  const bookingType =
    job.bookingType ?? (job.bookingNumber.includes('-S-') ? 'sale' : 'rental');
  let normalizedStages =
    bookingType === 'sale'
      ? EVENT_JOB_STAGE_KEYS.map((key) => {
          const existing = job.stages.find((stage) => stage.key === key);
          if (existing) {
            return key === 'stylist_opportunity' && existing.status !== 'done'
              ? {
                  ...existing,
                  status: 'done' as const,
                  completedBy: 'Not applicable — sale booking',
                }
              : existing;
          }
          const missing = newStage(key, false, job.createdAt);
          return key === 'stylist_opportunity'
            ? {
                ...missing,
                status: 'done' as const,
                completedAt: job.createdAt,
                completedBy: 'Not applicable — sale booking',
              }
            : missing;
        })
      : job.stages;
  // Recover older jobs where the result record was saved but the next-stage
  // flag was not. Exposing the recovered stage in reads lets the appropriate
  // portal finish the job; its next successful submission persists it.
  if (bookingType === 'rental' && job.status !== 'closed') {
    const returnQc = normalizedStages.find(
      (stage) => stage.key === 'return_quality_check',
    );
    const returnWarehouse = normalizedStages.find(
      (stage) => stage.key === 'return_warehouse',
    );
    const finalCheck = normalizedStages.find(
      (stage) => stage.key === 'booking_final_check',
    );
    if (
      job.returnQualityCheck &&
      returnQc?.status === 'done' &&
      returnWarehouse?.status === 'not_started'
    ) {
      normalizedStages = normalizedStages.map((stage) =>
        stage.key === 'return_warehouse'
          ? {
              ...stage,
              status: 'open' as const,
              openedAt: job.returnQualityCheck?.completedAt ?? job.updatedAt,
            }
          : stage,
      );
    }
    if (
      job.returnWarehouseCheck &&
      returnWarehouse?.status === 'done' &&
      finalCheck?.status === 'not_started'
    ) {
      normalizedStages = normalizedStages.map((stage) =>
        stage.key === 'booking_final_check'
          ? {
              ...stage,
              status: 'open' as const,
              openedAt: job.returnWarehouseCheck?.completedAt ?? job.updatedAt,
            }
          : stage,
      );
    }
  }
  return {
    ...job,
    createdAt: bookingCreatedAt
      ? bookingCreatedAt instanceof Date
        ? bookingCreatedAt.toISOString()
        : new Date(bookingCreatedAt).toISOString()
      : job.createdAt,
    bookingId,
    bookingType,
    stylistsRequired: bookingType === 'rental' ? job.stylistsRequired : false,
    stylistsRequiredCount:
      bookingType === 'rental' ? job.stylistsRequiredCount : 0,
    stages: normalizedStages,
    travelPlans: (job.travelPlans ?? []).map((plan) => ({
      ...plan,
      ticketConfirmedAt: plan.ticketConfirmedAt ?? null,
      ticketConfirmedBy: plan.ticketConfirmedBy ?? null,
      ticketFilePath: plan.ticketFilePath ?? null,
      ticketFileName: plan.ticketFileName ?? null,
    })),
    stylistExecutions: job.stylistExecutions ?? [],
    collectionCheck: job.collectionCheck ?? null,
    returnQualityCheck: job.returnQualityCheck ?? null,
    returnWarehouseCheck: job.returnWarehouseCheck ?? null,
    packingChecklist: job.packingChecklist
      ? {
          ...job.packingChecklist,
          proofPhotoPaths: job.packingChecklist.proofPhotoPaths ?? [],
        }
      : null,
    paymentSummary: job.paymentSummary ?? null,
    bookingFinalCheck: job.bookingFinalCheck ?? null,
    performanceCredited: job.performanceCredited ?? false,
    activity: (job.activity ?? []).map((entry) => ({
      ...entry,
      department: entry.department ?? 'system',
    })),
  };
}

function isUninitializedJobState(state: unknown): boolean {
  return Boolean(
    state &&
    typeof state === 'object' &&
    !Array.isArray(state) &&
    Object.keys(state).length === 0,
  );
}

function databaseDate(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'string') return value.slice(0, 10);
  return '';
}

async function readAllRaw(id?: string): Promise<EventJob[]> {
  const rows = await withServiceRole((tx) =>
    id
      ? tx<{ state: EventJob; booking_created_at: string | null }[]>`
          select ej.state, b.created_at as booking_created_at
          from public.event_jobs ej
          left join public.bookings b on b.id = ej.booking_id
          where ej.id = ${id}
        `
      : tx<{ state: EventJob; booking_created_at: string | null }[]>`
          select ej.state, b.created_at as booking_created_at
          from public.event_jobs ej
          left join public.bookings b on b.id = ej.booking_id
        `,
  );
  const jobs = rows
    .filter((row) => Boolean(row.state?.id && Array.isArray(row.state.stages)))
    .map((row) => normalizeJob(row.state, row.booking_created_at));
  return sortJobsByBookingDate(jobs);
}

// Self-healing pass: an `event_jobs` row is created the instant a booking is
// confirmed by a database trigger (open_event_job() in the Supabase
// migrations), but that trigger only ever inserts the bare row -- it never
// builds the JSON `state` column, which is the ONLY place bookingType,
// eventSummary (including customerName), requiredItems etc. actually live.
// That JSON was previously only ever filled in by syncEventJobs(), which only
// ran when someone opened the "Event Jobs" page -- so a job nobody had opened
// that page for yet showed up everywhere else (Stylist Portal included) with
// a blank "Customer not added" and no real event data. Running this before
// every job read means a job is fully populated the moment it exists, with no
// dependency on which page anyone visits first.
async function syncMissingJobs(): Promise<void> {
  const { rows, bookingsWithoutJobs } = await withServiceRole(async (tx) => {
    const [rows, bookingsWithoutJobs] = await Promise.all([
      tx<
        {
          booking_id: number;
          status: string;
          state: EventJob | Record<string, never> | null;
          booking_status: string;
          is_quote: boolean;
        }[]
      >`
        select ej.booking_id, ej.status, ej.state, b.status as booking_status, b.is_quote
        from public.event_jobs ej
        join public.bookings b on b.id = ej.booking_id
      `,
      tx<{ booking_id: number }[]>`
        select b.id as booking_id
        from public.bookings b
        left join public.event_jobs ej on ej.booking_id = b.id
        where b.status = 'confirmed' and not b.is_quote and ej.booking_id is null
      `,
    ]);
    return { rows, bookingsWithoutJobs };
  });
  const missingBookingIds = [
    ...new Set([
      ...rows
        .filter((row) => {
          const state = row.state as EventJob | null;
          // Truly never-synced: the trigger-created row still has its default
          // '{}' state, with no id at all. Safe to build from scratch -- there is
          // no history to lose. IMPORTANT: a row that has an id but somehow fails
          // the stricter Array.isArray(stages) check is deliberately treated as
          // "not eligible" here rather than "missing" -- syncEventJobs() would
          // otherwise treat it as brand new and silently OVERWRITE a real job's
          // stages/travelPlans/status with a freshly-initialized one. That
          // shape should never come up in practice, but must never be
          // auto-"healed" by recreating the job from the current booking alone.
          if (isUninitializedJobState(state)) {
            return row.booking_status === 'confirmed' && !row.is_quote;
          }
          const hasId = Boolean(state?.id);
          if (!hasId) return false;
          const looksValid = Array.isArray(state?.stages);
          return looksValid && !state?.eventSummary?.customerName;
        })
        .map((row) => Number(row.booking_id)),
      ...bookingsWithoutJobs.map((row) => Number(row.booking_id)),
    ]),
  ];
  if (!missingBookingIds.length) return;

  type MissingBookingRow = {
    id: number;
    booking_number: string;
    booking_type: string;
    status: string;
    event_name: string;
    event_date: string;
    event_time: string | null;
    event_location: string | null;
    customer_name: string | null;
    customer_phone: string | null;
    total: number;
    paid_amount: number;
    balance_amount: number;
    security_deposit: number;
    payment_status: string;
    created_at: string;
  };

  const { bookings, itemsRaw } = await withServiceRole(async (tx) => {
    const bookings = await tx<MissingBookingRow[]>`
      select b.id, b.booking_number, b.booking_type, b.status, b.event_name, b.event_date, b.event_time, b.event_location,
        c.name as customer_name, c.phone as customer_phone,
        b.total, b.paid_amount, b.balance_amount, b.security_deposit, b.payment_status, b.created_at::text as created_at
      from public.bookings b
      left join public.customers c on c.id = b.customer_id
      where b.id = any(${tx.array(missingBookingIds)}::bigint[])
    `;
    if (!bookings.length) {
      return {
        bookings,
        itemsRaw: [] as {
          booking_id: number;
          item_name: string;
          quantity: number;
        }[],
      };
    }
    const bookingIds = bookings.map((booking) => booking.id);
    const itemsRaw = await tx<
      { booking_id: number; item_name: string; quantity: number }[]
    >`
      select booking_id, item_name, quantity from public.booking_items where booking_id = any(${tx.array(bookingIds)}::bigint[])
    `;
    return { bookings, itemsRaw };
  });
  if (!bookings.length) return;

  const itemsByBookingId = new Map<
    number,
    { itemName: string; quantity: number }[]
  >();
  for (const item of itemsRaw) {
    const bookingId = Number(item.booking_id);
    const list = itemsByBookingId.get(bookingId) ?? [];
    list.push({ itemName: item.item_name, quantity: item.quantity });
    itemsByBookingId.set(bookingId, list);
  }

  const summaries: ConfirmedBookingSummary[] = bookings.map((booking) => ({
    bookingId: Number(booking.id),
    bookingNumber: booking.booking_number,
    bookingCreatedAt: booking.created_at,
    bookingType: booking.booking_type,
    status: booking.status,
    customerName: booking.customer_name ?? null,
    customerPhone: booking.customer_phone ?? null,
    eventName: booking.event_name,
    eventDate: databaseDate(booking.event_date),
    eventTime: booking.event_time,
    eventLocation: booking.event_location,
    items: itemsByBookingId.get(Number(booking.id)) ?? [],
    payment: {
      totalAmount: Number(booking.total),
      amountReceived: Number(booking.paid_amount),
      pendingBalance: Number(booking.balance_amount),
      depositAmount: Number(booking.security_deposit),
      paymentStatus: booking.payment_status,
    },
  }));

  await syncEventJobs(summaries);
}

async function readAll(id?: string): Promise<EventJob[]> {
  await syncMissingJobs();
  return readAllRaw(id);
}

type StylistInterestRow = {
  id: string;
  event_job_id: string;
  staff_id: number;
  status: string;
  expressed_at: string;
  decided_at: string | null;
  decided_by: string | null;
};

async function readAllForStylistWorkflow(jobId?: string): Promise<EventJob[]> {
  await syncMissingJobs();
  const { jobRows, interestRows } = await withServiceRole(async (tx) => {
    const jobRows = jobId
      ? await tx<{ state: EventJob; booking_created_at: string | null }[]>`
          select ej.state, b.created_at as booking_created_at
          from public.event_jobs ej
          left join public.bookings b on b.id = ej.booking_id
          where ej.id = ${jobId}
        `
      : await tx<{ state: EventJob; booking_created_at: string | null }[]>`
          select ej.state, b.created_at as booking_created_at
          from public.event_jobs ej
          left join public.bookings b on b.id = ej.booking_id
        `;
    const interestRows = jobId
      ? await tx<StylistInterestRow[]>`
          select id, event_job_id, staff_id, status, expressed_at, decided_at, decided_by
          from public.event_job_stylist_interest where event_job_id = ${jobId}
        `
      : await tx<StylistInterestRow[]>`
          select id, event_job_id, staff_id, status, expressed_at, decided_at, decided_by
          from public.event_job_stylist_interest
        `;
    return { jobRows, interestRows };
  });

  const staffIds = [
    ...new Set(interestRows.map((row) => Number(row.staff_id))),
  ];
  const staffRows = staffIds.length
    ? await withServiceRole(
        (tx) => tx<{ id: number; user_id: string | null; name: string }[]>`
        select id, user_id, name from public.staff_members where id = any(${tx.array(staffIds)}::bigint[])
      `,
      )
    : [];
  const staffById = new Map(staffRows.map((row) => [Number(row.id), row]));
  const interestsByJob = new Map<string, StylistInterest[]>();
  for (const row of interestRows) {
    const staff = staffById.get(Number(row.staff_id));
    if (!staff?.user_id) continue;
    const jobIdKey = String(row.event_job_id);
    const interest: StylistInterest = {
      id: String(row.id),
      stylistAccountId: String(staff.user_id),
      stylistName: String(staff.name),
      status: row.status as StylistInterestStatus,
      expressedAt: String(row.expressed_at),
      decidedAt: row.decided_at ? String(row.decided_at) : null,
      decidedBy: row.decided_by ? String(row.decided_by) : null,
    };
    interestsByJob.set(jobIdKey, [
      ...(interestsByJob.get(jobIdKey) ?? []),
      interest,
    ]);
  }

  return sortJobsByBookingDate(
    jobRows
      .filter((row) =>
        Boolean(row.state?.id && Array.isArray(row.state.stages)),
      )
      .map((row) =>
        normalizeJob(
          {
            ...row.state,
            stylistInterests:
              interestsByJob.get(row.state.id) ??
              row.state.stylistInterests ??
              [],
          },
          row.booking_created_at,
        ),
      ),
  );
}

async function writeAll(
  jobs: EventJob[],
  options: {
    expectedUpdatedAt?: string;
    afterWrite?: (tx: Tx) => Promise<void>;
  } = {},
) {
  if (!jobs.length) return;
  // Multiple portal/dashboard requests can discover the same trigger-created
  // placeholders at once. Serialize writers and always lock rows in booking
  // order so concurrent requests cannot deadlock while updating event_jobs and
  // its child stage rows.
  const orderedJobs = [...jobs].sort(
    (first, second) => Number(first.bookingId) - Number(second.bookingId),
  );
  const bookingIds = [
    ...new Set(orderedJobs.map((job) => Number(job.bookingId))),
  ];

  await withServiceRole(async (tx) => {
    await tx`select pg_advisory_xact_lock(731942615)`;
    const bookingRows = await tx<{ id: number; owner_id: string }[]>`
      select id, owner_id from public.bookings where id = any(${tx.array(bookingIds)}::bigint[])
      order by id
    `;
    const owners = new Map(
      bookingRows.map((booking) => [
        Number(booking.id),
        String(booking.owner_id),
      ]),
    );

    for (const job of orderedJobs) {
      const ownerId = owners.get(Number(job.bookingId));
      if (!ownerId) continue;
      if (options.expectedUpdatedAt) {
        const [current] = await tx<{ state: EventJob }[]>`
          select state from public.event_jobs where booking_id = ${job.bookingId} for update
        `;
        if (current?.state?.updatedAt !== options.expectedUpdatedAt) {
          throw new Error(
            'This job changed while you were working. Refresh it and try again.',
          );
        }
      }
      await tx`
        insert into public.event_jobs (
          id, booking_id, owner_id, job_number, status, stylists_required_count,
          payment_summary, booking_final_check, performance_credited, state,
          created_at, updated_at, closed_at
        ) values (
          ${job.id}, ${job.bookingId}, ${ownerId}, ${job.id}, ${job.status}, ${job.stylistsRequiredCount},
          ${tx.json(job.paymentSummary as never)}, ${tx.json(job.bookingFinalCheck as never)}, ${job.performanceCredited}, ${tx.json(job as never)},
          ${job.createdAt}, ${job.updatedAt}, ${job.closedAt}
        )
        on conflict (booking_id) do update set
          id = excluded.id,
          job_number = excluded.job_number,
          status = excluded.status,
          stylists_required_count = excluded.stylists_required_count,
          payment_summary = excluded.payment_summary,
          booking_final_check = excluded.booking_final_check,
          performance_credited = excluded.performance_credited,
          state = excluded.state,
          updated_at = excluded.updated_at,
          closed_at = excluded.closed_at
      `;

      for (const stage of job.stages) {
        await tx`
          insert into public.event_job_stages (event_job_id, stage, status, assigned_staff_id, opened_at, completed_at, notes)
          values (
            ${job.id}, ${stage.key}, ${stage.status},
            ${stage.assignedStaffId ? Number(stage.assignedStaffId) || null : null},
            ${stage.openedAt}, ${stage.completedAt},
            ${tx.json({ text: stage.notes, completed_by_name: stage.completedBy })}
          )
          on conflict (event_job_id, stage) do update set
            status = excluded.status,
            assigned_staff_id = excluded.assigned_staff_id,
            opened_at = excluded.opened_at,
            completed_at = excluded.completed_at,
            notes = excluded.notes
        `;
      }

      const persistedStages = await tx<{ id: string; stage: string }[]>`
        select id, stage from public.event_job_stages where event_job_id = ${job.id}
      `;
      const stageIds = new Map(
        persistedStages.map((stage) => [stage.stage, String(stage.id)]),
      );

      const qualityStageId = stageIds.get('quality_check');
      if (qualityStageId && job.qualityCheck) {
        for (const item of job.qualityCheck.items) {
          await tx`
            insert into public.event_job_qc_items (event_job_stage_id, item_name, checked_quantity, good_quantity, issue_type, remarks, evidence_photo_url)
            values (${qualityStageId}, ${item.itemName}, ${item.checkedQuantity}, ${item.goodQuantity}, ${item.issueType}, ${item.remarks}, ${item.evidenceNote || null})
            on conflict (event_job_stage_id, item_name) do update set
              checked_quantity = excluded.checked_quantity,
              good_quantity = excluded.good_quantity,
              issue_type = excluded.issue_type,
              remarks = excluded.remarks,
              evidence_photo_url = excluded.evidence_photo_url
          `;
        }
      }
      const returnStageId = stageIds.get('return_quality_check');
      if (returnStageId && job.returnQualityCheck) {
        for (const item of job.returnQualityCheck.items) {
          await tx`
            insert into public.event_job_qc_items (event_job_stage_id, item_name, checked_quantity, good_quantity, damaged_quantity, repair_required_quantity, unusable_quantity, remarks, evidence_photo_url)
            values (
              ${returnStageId}, ${item.itemName}, ${item.returnedQuantity}, ${item.goodQuantity}, ${item.damagedQuantity},
              ${item.repairRequired ? item.damagedQuantity : 0}, ${item.unusable ? item.damagedQuantity : 0},
              ${item.remarks}, ${item.evidenceNote || null}
            )
            on conflict (event_job_stage_id, item_name) do update set
              checked_quantity = excluded.checked_quantity,
              good_quantity = excluded.good_quantity,
              damaged_quantity = excluded.damaged_quantity,
              repair_required_quantity = excluded.repair_required_quantity,
              unusable_quantity = excluded.unusable_quantity,
              remarks = excluded.remarks,
              evidence_photo_url = excluded.evidence_photo_url
          `;
        }
      }

      const packingStageId = stageIds.get('packing');
      if (packingStageId && job.packingChecklist) {
        const checklist = job.packingChecklist;
        await tx`
          insert into public.event_job_packing_checklist (
            event_job_stage_id, correct_quantity_packed, correct_boxes, proper_labels,
            accessories_included, items_secured, correct_event_identification, remarks, proof_photo_url
          ) values (
            ${packingStageId}, ${checklist.correctQuantityPacked}, ${checklist.correctBoxes}, ${checklist.properLabels},
            ${checklist.accessoriesIncluded}, ${checklist.itemsSecured}, ${checklist.correctEventIdentification},
            ${checklist.remarks}, ${checklist.proofPhotoPaths[0] ?? null}
          )
          on conflict (event_job_stage_id) do update set
            correct_quantity_packed = excluded.correct_quantity_packed,
            correct_boxes = excluded.correct_boxes,
            proper_labels = excluded.proper_labels,
            accessories_included = excluded.accessories_included,
            items_secured = excluded.items_secured,
            correct_event_identification = excluded.correct_event_identification,
            remarks = excluded.remarks,
            proof_photo_url = excluded.proof_photo_url
        `;
      }

      for (const entry of job.activity) {
        await tx`
          insert into public.event_job_activity (id, event_job_id, actor, department, action, details, created_at)
          values (${entry.id}, ${job.id}, ${entry.actor}, ${entry.department}, ${entry.action}, ${entry.details ?? null}, ${entry.at})
          on conflict (id) do update set
            actor = excluded.actor, department = excluded.department, action = excluded.action,
            details = excluded.details, created_at = excluded.created_at
        `;
      }

      for (const issue of job.issues) {
        await tx`
          insert into public.event_job_issues (id, event_job_id, stage, description, raised_by_name, raised_at, resolved_at)
          values (${issue.id}, ${job.id}, ${issue.stage}, ${issue.description}, ${issue.raisedBy}, ${issue.raisedAt}, ${issue.resolvedAt})
          on conflict (id) do update set
            stage = excluded.stage, description = excluded.description, raised_by_name = excluded.raised_by_name,
            raised_at = excluded.raised_at, resolved_at = excluded.resolved_at
        `;
      }
    }

    // Stylist participation is intentionally rental-only. Older event JSON can
    // still contain legacy interest entries for sales, cancelled, or completed
    // jobs; attempting to recreate those normalized rows is correctly rejected
    // by the database trigger and must not break unrelated workflow saves.
    const stylistJobs = jobs.filter(
      (job) =>
        job.status === 'active' &&
        job.bookingType === 'rental' &&
        job.stylistsRequired,
    );
    const stylistUserIds = [
      ...new Set(
        stylistJobs.flatMap((job) =>
          job.stylistInterests.map((interest) => interest.stylistAccountId),
        ),
      ),
    ];
    if (stylistUserIds.length) {
      const staffRows = await tx<{ id: number; user_id: string }[]>`
        select id, user_id from public.staff_members where user_id = any(${tx.array(stylistUserIds)}::uuid[])
      `;
      const staffByUser = new Map(
        staffRows.map((row) => [String(row.user_id), Number(row.id)]),
      );
      for (const job of stylistJobs) {
        for (const interest of job.stylistInterests) {
          const staffId = staffByUser.get(interest.stylistAccountId);
          if (!staffId) continue;
          await tx`
            insert into public.event_job_stylist_interest (id, event_job_id, staff_id, status, expressed_at, decided_at)
            values (${interest.id}, ${job.id}, ${staffId}, ${interest.status}, ${interest.expressedAt}, ${interest.decidedAt})
            on conflict (id) do update set
              status = excluded.status, expressed_at = excluded.expressed_at, decided_at = excluded.decided_at
          `;
        }
      }
    }
    if (options.afterWrite) await options.afterWrite(tx);
  });
}

// "BK-2005 -> JOB-2005"-style derivation from the real booking number, e.g.
// "SW-S-2026-0001" -> "JOB-2026-0001". Falls back to the booking id if the number
// doesn't match the expected trailing year-sequence shape, so this never throws.
export function deriveJobId(bookingNumber: string, bookingId: number): string {
  const match = bookingNumber.match(/SW-([SR])-(\d{4}-\d+)$/i);
  if (match) return `JOB-${match[1].toUpperCase()}-${match[2]}`;
  const trailing = bookingNumber.match(/(\d{4}-\d+)$/);
  if (trailing) return `JOB-${trailing[1]}-B${bookingId}`;
  return `JOB-B${bookingId}`;
}

function newStage(
  key: EventJobStageKey,
  open: boolean,
  now: string,
): EventJobStage {
  return {
    key,
    status: open ? 'open' : 'not_started',
    assignedStaffId: null,
    openedAt: open ? now : null,
    completedAt: null,
    completedBy: null,
    notes: '',
  };
}

function activityEntry(
  actor: string,
  department: string,
  action: string,
  details?: string,
): EventJobActivityEntry {
  return {
    id: randomUUID(),
    at: new Date().toISOString(),
    actor,
    department,
    action,
    details,
  };
}

function findStage(
  job: EventJob,
  key: EventJobStageKey,
): EventJobStage | undefined {
  return job.stages.find((stage) => stage.key === key);
}

function setStage(
  job: EventJob,
  key: EventJobStageKey,
  changes: Partial<EventJobStage>,
): EventJob {
  return {
    ...job,
    stages: job.stages.map((stage) =>
      stage.key === key ? { ...stage, ...changes } : stage,
    ),
  };
}

export const listJobs = cache(async (): Promise<EventJob[]> => {
  return readAll();
});

export const listActiveJobs = cache(async (): Promise<EventJob[]> => {
  await syncMissingJobs();
  const rows = await withServiceRole(
    (tx) => tx<{ state: EventJob; booking_created_at: string | null }[]>`
    select ej.state, b.created_at as booking_created_at
    from public.event_jobs ej
    left join public.bookings b on b.id = ej.booking_id
    where ej.status = 'active'
  `,
  );
  return sortJobsByBookingDate(
    rows
      .filter((row) =>
        Boolean(row.state?.id && Array.isArray(row.state.stages)),
      )
      .map((row) => normalizeJob(row.state, row.booking_created_at)),
  );
});

export const getJob = cache(async (id: string): Promise<EventJob | null> => {
  await syncMissingJobs();
  const [row] = await withServiceRole(
    (tx) => tx<{ state: EventJob }[]>`
    select state from public.event_jobs where id = ${id}
  `,
  );
  const job = row?.state;
  return job?.id && Array.isArray(job.stages) ? normalizeJob(job) : null;
});

export const getJobByBookingId = cache(
  async (bookingId: number): Promise<EventJob | null> => {
    await syncMissingJobs();
    const [row] = await withServiceRole(
      (tx) => tx<{ state: EventJob }[]>`
      select state from public.event_jobs where booking_id = ${bookingId}
    `,
    );
    const job = row?.state;
    return job?.id && Array.isArray(job.stages) ? normalizeJob(job) : null;
  },
);

// Reads a list of CONFIRMED bookings (is_quote = false and status not in
// draft/cancelled — the caller is responsible for that filter, since only a page with
// a real Supabase session can query bookings) and:
//   1. creates exactly one Central Event Job per booking that doesn't already have one
//      (duplicate-safe — never creates a second job for a bookingId that already has one)
//   2. refreshes the event/item snapshot on existing ACTIVE jobs so it doesn't go stale,
//      WITHOUT ever touching warehousePrep/qualityCheck/packingChecklist/stylistInterests
//      (those belong to the department that recorded them, never overwritten by a sync).
export async function syncEventJobs(
  bookings: ConfirmedBookingSummary[],
): Promise<EventJob[]> {
  const jobs = await readAllRaw();
  const byBookingId = new Map(jobs.map((job) => [job.bookingId, job] as const));

  // The database trigger deliberately creates an event_jobs row with an
  // empty `{}` state before this function runs. That placeholder must be
  // initialized here. Any non-empty row that does not parse as an EventJob,
  // however, may contain real history and is protected from being replaced.
  const rawRows = await withServiceRole(
    (tx) => tx<{ booking_id: number; state: unknown }[]>`
    select booking_id, state from public.event_jobs
  `,
  );
  const protectedRawBookingIds = new Set(
    rawRows
      .filter((row) => !isUninitializedJobState(row.state))
      .map((row) => Number(row.booking_id)),
  );

  const now = new Date().toISOString();
  const changedJobs: EventJob[] = [];
  const newStylistJobs: EventJob[] = [];

  for (const booking of bookings) {
    const existing = byBookingId.get(booking.bookingId);
    const eventSummary = {
      customerName: booking.customerName ?? null,
      customerPhone: booking.customerPhone ?? null,
      eventName: booking.eventName,
      eventDate: booking.eventDate,
      eventTime: booking.eventTime,
      venue: booking.eventLocation,
    };

    if (existing) {
      const bookingType = booking.bookingType === 'sale' ? 'sale' : 'rental';
      const stylistsRequired = bookingType === 'rental';
      const snapshotChanged =
        existing.createdAt !== booking.bookingCreatedAt ||
        existing.bookingType !== bookingType ||
        existing.stylistsRequired !== stylistsRequired ||
        JSON.stringify(existing.eventSummary) !==
          JSON.stringify(eventSummary) ||
        JSON.stringify(existing.requiredItems) !==
          JSON.stringify(booking.items) ||
        JSON.stringify(existing.paymentSummary) !==
          JSON.stringify(booking.payment);
      if (existing.status === 'active' && snapshotChanged) {
        const index = jobs.findIndex((job) => job.id === existing.id);
        jobs[index] = {
          ...jobs[index],
          createdAt: booking.bookingCreatedAt,
          bookingType,
          stylistsRequired,
          stylistsRequiredCount: stylistsRequired
            ? Math.max(existing.stylistsRequiredCount, 1)
            : 0,
          stages: stylistsRequired
            ? jobs[index].stages
            : jobs[index].stages.map((stage) =>
                stage.key === 'stylist_opportunity'
                  ? {
                      ...stage,
                      status: 'done',
                      completedAt: stage.completedAt ?? now,
                      completedBy: 'Not applicable — sale booking',
                    }
                  : stage,
              ),
          eventSummary,
          requiredItems: booking.items,
          paymentSummary: booking.payment,
          updatedAt: now,
        };
        changedJobs.push(jobs[index]);
      } else if (
        !existing.eventSummary.customerName &&
        eventSummary.customerName
      ) {
        // A closed/non-active job is otherwise left alone (its stages,
        // payment snapshot etc. are historical and shouldn't drift), but a
        // blank customer name is purely a display bug -- fill in just that
        // one field so old jobs stop showing "Customer not added" forever.
        const index = jobs.findIndex((job) => job.id === existing.id);
        jobs[index] = {
          ...jobs[index],
          eventSummary: {
            ...jobs[index].eventSummary,
            customerName: eventSummary.customerName,
            customerPhone: eventSummary.customerPhone,
          },
          updatedAt: now,
        };
        changedJobs.push(jobs[index]);
      }
      continue;
    }

    if (protectedRawBookingIds.has(booking.bookingId)) {
      // A row exists for this booking but its state didn't parse cleanly
      // above -- do not treat that as "no job yet" and recreate one. Leave
      // it untouched; this needs a human look, not an automatic rewrite.
      continue;
    }

    const stylistsRequired = booking.bookingType === 'rental';
    const stages = EVENT_JOB_STAGE_KEYS.map((key) => {
      const stage = newStage(key, INITIAL_OPEN_STAGES.includes(key), now);
      return booking.bookingType === 'sale' &&
        [
          'stylist_opportunity',
          'collection',
          'return_quality_check',
          'return_warehouse',
        ].includes(key)
        ? {
            ...stage,
            status: 'done' as const,
            completedAt: now,
            completedBy: 'Not applicable — sale booking',
          }
        : stage;
    });

    const job: EventJob = {
      id: deriveJobId(booking.bookingNumber, booking.bookingId),
      bookingId: booking.bookingId,
      bookingNumber: booking.bookingNumber,
      bookingType: booking.bookingType === 'sale' ? 'sale' : 'rental',
      eventSummary,
      requiredItems: booking.items,
      stylistsRequired,
      stylistsRequiredCount: stylistsRequired ? 1 : 0,
      status: 'active',
      stages,
      warehousePrep: null,
      qualityCheck: null,
      packingChecklist: null,
      stylistInterests: [],
      travelPlans: [],
      stylistExecutions: [],
      collectionCheck: null,
      returnQualityCheck: null,
      returnWarehouseCheck: null,
      paymentSummary: booking.payment,
      bookingFinalCheck: null,
      performanceCredited: false,
      issues: [],
      activity: [
        activityEntry(
          'system',
          'system',
          'job_created',
          `Central Event Job created from confirmed booking ${booking.bookingNumber} (status: ${booking.status}).`,
        ),
      ],
      createdAt: booking.bookingCreatedAt,
      updatedAt: now,
      closedAt: null,
    };
    jobs.push(job);
    byBookingId.set(booking.bookingId, job);
    changedJobs.push(job);
    if (stylistsRequired) {
      newStylistJobs.push(job);
    }
  }

  if (changedJobs.length) await writeAll(changedJobs);
  if (newStylistJobs.length) {
    const results = await Promise.allSettled(
      newStylistJobs.map((job) =>
        notifyDepartment(
          job.id,
          'stylist',
          `${job.eventSummary.eventName} (${job.id}) is open for stylist interest.`,
        ),
      ),
    );
    for (const result of results) {
      if (result.status === 'rejected') {
        console.error(
          '[event-jobs] stylist notification failed',
          result.reason,
        );
      }
    }
  }
  return sortJobsByBookingDate(jobs);
}

export function currentStageSummary(job: EventJob): string {
  if (job.status === 'closed') return 'Event closed';
  const open = job.stages.filter(
    (stage) => stage.status === 'open' || stage.status === 'in_progress',
  );
  if (open.length === 0) {
    const packing = findStage(job, 'packing');
    if (packing?.status === 'done') return 'Ready for event';
    return 'Awaiting next stage';
  }
  return open.map((stage) => STAGE_LABEL[stage.key]).join(' + ');
}

export async function jobsForDepartment(department: StaffDepartment) {
  const jobs = (await readAll()).filter(
    (job) =>
      job.status === 'active' &&
      (department !== 'stylist' || job.bookingType === 'rental'),
  );
  return jobs
    .map((job) => ({
      job,
      stages: job.stages.filter(
        (stage) =>
          STAGE_DEPARTMENT[stage.key] === department &&
          (stage.status === 'open' || stage.status === 'in_progress'),
      ),
    }))
    .filter((entry) => entry.stages.length > 0);
}

export async function addIssue(
  jobId: string,
  description: string,
  raisedBy: string,
  stage: EventJobStageKey | null,
) {
  const jobs = await readAll(jobId);
  const index = jobs.findIndex((job) => job.id === jobId);
  if (index === -1) return null;
  const issue: EventJobIssue = {
    id: randomUUID(),
    stage,
    description,
    raisedBy,
    raisedAt: new Date().toISOString(),
    resolved: false,
    resolvedAt: null,
  };
  jobs[index] = {
    ...jobs[index],
    issues: [issue, ...jobs[index].issues],
    activity: [
      activityEntry(raisedBy, 'admin', 'issue_raised', description),
      ...jobs[index].activity,
    ],
    updatedAt: new Date().toISOString(),
  };
  await writeAll([jobs[index]]);
  return jobs[index];
}

export async function resolveIssue(
  jobId: string,
  issueId: string,
  resolvedBy: string,
) {
  const jobs = await readAll(jobId);
  const index = jobs.findIndex((job) => job.id === jobId);
  if (index === -1) return null;
  const issues = jobs[index].issues.map((issue) =>
    issue.id === issueId
      ? { ...issue, resolved: true, resolvedAt: new Date().toISOString() }
      : issue,
  );
  jobs[index] = {
    ...jobs[index],
    issues,
    activity: [
      activityEntry(resolvedBy, 'admin', 'issue_resolved'),
      ...jobs[index].activity,
    ],
    updatedAt: new Date().toISOString(),
  };
  await writeAll([jobs[index]]);
  return jobs[index];
}

// ---- Step 4: Warehouse pre-event preparation ----------------------------------

export type WarehousePrepResult = { job?: EventJob; error?: string };

export async function submitWarehousePreparation(
  jobId: string,
  items: WarehouseItemPrep[],
  staffName: string,
): Promise<WarehousePrepResult> {
  const jobs = await readAll(jobId);
  const index = jobs.findIndex((job) => job.id === jobId);
  if (index === -1) return { error: 'Job not found.' };
  const job = jobs[index];
  const stage = findStage(job, 'warehouse_pick');
  if (!stage || (stage.status !== 'open' && stage.status !== 'in_progress')) {
    return { error: 'Warehouse preparation is not open for this job.' };
  }
  if (
    items.some(
      (item) => item.preparedQuantity === null || item.preparedQuantity < 0,
    )
  ) {
    return {
      error:
        'Enter a prepared quantity (0 or more) for every item before completing.',
    };
  }

  const now = new Date().toISOString();
  let updated: EventJob = {
    ...job,
    warehousePrep: { items, completedAt: now, completedBy: staffName },
  };
  updated = setStage(updated, 'warehouse_pick', {
    status: 'done',
    completedAt: now,
    completedBy: staffName,
  });
  updated = setStage(updated, 'quality_check', {
    status: 'open',
    openedAt: now,
  });
  await notifyDepartment(
    job.id,
    'qc',
    `${job.id} — Warehouse preparation complete, ready for Quality Check.`,
  );
  const shortages = items.filter(
    (item) =>
      item.unavailable ||
      item.damaged ||
      (item.preparedQuantity ?? 0) < item.requiredQuantity,
  );
  updated = {
    ...updated,
    updatedAt: now,
    activity: [
      activityEntry(
        staffName,
        'warehouse',
        'warehouse_preparation_completed',
        shortages.length
          ? `Completed with ${shortages.length} item(s) short/unavailable/damaged.`
          : 'All required items prepared in full.',
      ),
      ...updated.activity,
    ],
  };
  jobs[index] = updated;
  await writeAll([updated]);

  return { job: updated };
}

// ---- Step 5: QC & Packing pre-event --------------------------------------------

export type QcResult = { job?: EventJob; error?: string };

export async function submitQualityCheck(
  jobId: string,
  items: QcItemCheck[],
  staffName: string,
): Promise<QcResult> {
  const jobs = await readAll(jobId);
  const index = jobs.findIndex((job) => job.id === jobId);
  if (index === -1) return { error: 'Job not found.' };
  const job = jobs[index];
  const stage = findStage(job, 'quality_check');
  if (!stage || (stage.status !== 'open' && stage.status !== 'in_progress')) {
    return { error: 'Quality check is not open for this job yet.' };
  }
  if (
    items.some(
      (item) => item.checkedQuantity === null || item.goodQuantity === null,
    )
  ) {
    return {
      error: 'Enter a checked quantity and a good quantity for every item.',
    };
  }
  if (
    items.some(
      (item) =>
        !Number.isFinite(item.checkedQuantity) ||
        !Number.isFinite(item.goodQuantity) ||
        (item.checkedQuantity ?? 0) < 0 ||
        (item.goodQuantity ?? 0) < 0,
    )
  ) {
    return {
      error: 'Quality Check quantities must be valid positive numbers.',
    };
  }
  if (
    items.some((item) => (item.goodQuantity ?? 0) > (item.checkedQuantity ?? 0))
  ) {
    return { error: 'Good quantity cannot be more than checked quantity.' };
  }
  if (
    items.some(
      (item) =>
        (item.goodQuantity ?? 0) < (item.checkedQuantity ?? 0) &&
        item.issueType === 'none',
    )
  ) {
    return { error: 'Select an issue for every product that does not pass.' };
  }
  const now = new Date().toISOString();
  const problems = items.reduce(
    (sum, item) =>
      sum + Math.max((item.checkedQuantity ?? 0) - (item.goodQuantity ?? 0), 0),
    0,
  );
  let updated: EventJob = {
    ...job,
    qualityCheck: { items, completedAt: now, completedBy: staffName },
  };
  updated = setStage(updated, 'quality_check', {
    status: 'done',
    completedAt: now,
    completedBy: staffName,
  });
  updated = setStage(
    updated,
    'packing',
    problems
      ? { status: 'not_started', openedAt: null }
      : { status: 'open', openedAt: now },
  );
  if (problems) {
    updated = setStage(updated, 'warehouse_pick', {
      status: 'open',
      openedAt: now,
      completedAt: null,
      completedBy: null,
    });
    updated = setStage(updated, 'quality_check', {
      status: 'not_started',
      openedAt: null,
      completedAt: null,
      completedBy: null,
    });
    await notifyDepartment(
      job.id,
      'warehouse',
      `${job.id} — QC flagged ${problems} item(s). Please correct and repick the items.`,
    );
  }
  updated = {
    ...updated,
    updatedAt: now,
    activity: [
      activityEntry(
        staffName,
        'qc',
        'quality_check_completed',
        problems
          ? `${problems} item(s) flagged with a problem.`
          : 'All checked items passed.',
      ),
      ...updated.activity,
    ],
  };
  jobs[index] = updated;
  await writeAll([updated]);

  return { job: updated };
}

export async function submitPackingChecklist(
  jobId: string,
  checklist: Omit<PackingChecklist, 'completedAt' | 'completedBy'>,
  staffName: string,
): Promise<QcResult> {
  const jobs = await readAll(jobId);
  const index = jobs.findIndex((job) => job.id === jobId);
  if (index === -1) return { error: 'Job not found.' };
  const job = jobs[index];
  const qcStage = findStage(job, 'quality_check');
  if (!qcStage || qcStage.status !== 'done') {
    return { error: 'Complete the quality check before packing.' };
  }
  const packingStage = findStage(job, 'packing');
  if (
    !packingStage ||
    (packingStage.status !== 'open' && packingStage.status !== 'in_progress')
  ) {
    return { error: 'Packing is not open for this job yet.' };
  }
  const allChecked =
    checklist.correctQuantityPacked &&
    checklist.correctBoxes &&
    checklist.properLabels &&
    checklist.accessoriesIncluded &&
    checklist.itemsSecured &&
    checklist.correctEventIdentification;
  if (!allChecked) {
    return {
      error:
        'All six packing checks must be confirmed before completing packing.',
    };
  }

  const now = new Date().toISOString();
  let updated: EventJob = {
    ...job,
    packingChecklist: {
      ...checklist,
      completedAt: now,
      completedBy: staffName,
    },
  };
  updated = setStage(updated, 'packing', {
    status: 'done',
    completedAt: now,
    completedBy: staffName,
  });
  // Rental collection opens only after the stylist confirms the work is done.
  if (job.bookingType !== 'rental') {
    updated = setStage(updated, 'booking_final_check', {
      status: 'open',
      openedAt: now,
    });
  }
  updated = {
    ...updated,
    updatedAt: now,
    activity: [
      activityEntry(
        staffName,
        'qc',
        'packing_completed',
        'Products packed and ready for the event.',
      ),
      ...updated.activity,
    ],
  };
  jobs[index] = updated;
  await writeAll([updated]);
  return { job: updated };
}

// ---- Step 6: Stylist opportunity + interest ------------------------------------

export async function expressStylistInterest(
  jobId: string,
  stylistAccountId: string,
  stylistName: string,
) {
  const { stylist, hasStylistDepartment } = await withServiceRole(
    async (tx) => {
      const [stylist] = await tx<
        {
          id: number;
          name: string;
          staff_type: string;
          portal_active: boolean;
          is_active: boolean;
        }[]
      >`
      select id, name, staff_type, portal_active, is_active from public.staff_members where user_id = ${stylistAccountId}
    `;
      if (!stylist) return { stylist: null, hasStylistDepartment: false };
      const [row] = await tx<{ exists: boolean }[]>`
      select exists(select 1 from public.staff_departments where staff_id = ${stylist.id} and department = 'stylist') as exists
    `;
      return { stylist, hasStylistDepartment: Boolean(row?.exists) };
    },
  );
  if (!stylist) return { error: 'Stylist account was not found.' };
  if (
    stylist.staff_type !== 'stylist' ||
    !stylist.portal_active ||
    !stylist.is_active ||
    !hasStylistDepartment
  ) {
    return { error: 'This stylist account is not active.' };
  }

  const jobs = await readAllForStylistWorkflow(jobId);
  const index = jobs.findIndex((job) => job.id === jobId);
  if (index === -1) return { error: 'Event was not found.' };
  const job = jobs[index];
  const stage = findStage(job, 'stylist_opportunity');
  if (
    job.status !== 'active' ||
    job.bookingType !== 'rental' ||
    !job.stylistsRequired ||
    !stage ||
    !['open', 'in_progress'].includes(stage.status)
  ) {
    return { error: 'Stylist applications are closed for this event.' };
  }
  if (
    job.stylistInterests.some(
      (interest) => interest.stylistAccountId === stylistAccountId,
    )
  ) {
    return { job }; // idempotent: the database unique constraint is the second guard.
  }
  const interest: StylistInterest = {
    id: randomUUID(),
    stylistAccountId,
    stylistName,
    status: 'interested',
    expressedAt: new Date().toISOString(),
    decidedAt: null,
    decidedBy: null,
  };
  try {
    await withServiceRole(
      (tx) => tx`
      insert into public.event_job_stylist_interest (id, event_job_id, staff_id, status, expressed_at)
      values (${interest.id}, ${job.id}, ${stylist.id}, 'interested', ${interest.expressedAt})
    `,
    );
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code !== '23505') {
      return {
        error:
          error instanceof Error ? error.message : 'Unable to record interest.',
      };
    }
  }

  const refreshedJobs = await readAllForStylistWorkflow(jobId);
  const refreshedIndex = refreshedJobs.findIndex((entry) => entry.id === jobId);
  if (refreshedIndex === -1)
    return { error: 'Event was not found after saving interest.' };
  refreshedJobs[refreshedIndex] = {
    ...refreshedJobs[refreshedIndex],
    activity: [
      activityEntry(
        stylistName || stylist.name,
        'stylist',
        'stylist_interest_expressed',
        'Marked as interested and available.',
      ),
      ...refreshedJobs[refreshedIndex].activity,
    ],
    updatedAt: new Date().toISOString(),
  };
  // Persist only the event the stylist acted on. Rewriting every historical
  // job here can revive obsolete interest data and makes one click depend on
  // unrelated events remaining valid forever.
  await writeAll([refreshedJobs[refreshedIndex]]);
  return { job: refreshedJobs[refreshedIndex] };
}

export type StylistAssignmentResult = { job?: EventJob; error?: string };

export async function withdrawStylistInterest(
  jobId: string,
  stylistAccountId: string,
): Promise<{ job?: EventJob; error?: string }> {
  const jobs = await readAllForStylistWorkflow(jobId);
  const index = jobs.findIndex((job) => job.id === jobId);
  if (index === -1) return { error: 'Event was not found.' };
  const job = jobs[index];
  const interest = job.stylistInterests.find(
    (entry) => entry.stylistAccountId === stylistAccountId,
  );
  if (!interest)
    return { error: 'You have not marked interest in this event.' };
  if (interest.status !== 'interested') {
    return { error: 'Approved or decided interest cannot be withdrawn.' };
  }
  const [staff] = await withServiceRole(
    (tx) => tx<{ id: number }[]>`
    select id from public.staff_members where user_id = ${stylistAccountId}
  `,
  );
  if (!staff?.id) return { error: 'Stylist account was not found.' };
  await withServiceRole(
    (tx) => tx`
    delete from public.event_job_stylist_interest where event_job_id = ${job.id} and staff_id = ${staff.id}
  `,
  );
  const updated = {
    ...job,
    stylistInterests: job.stylistInterests.filter(
      (entry) => entry.id !== interest.id,
    ),
    activity: [
      activityEntry(
        interest.stylistName,
        'stylist',
        'stylist_interest_withdrawn',
        'Withdrew stylist interest.',
      ),
      ...job.activity,
    ],
    updatedAt: new Date().toISOString(),
  };
  await writeAll([updated]);
  return { job: updated };
}

export async function assignStylists(
  jobId: string,
  interestIds: string[],
  decidedBy: string,
): Promise<StylistAssignmentResult> {
  const jobs = await readAllForStylistWorkflow(jobId);
  const index = jobs.findIndex((job) => job.id === jobId);
  if (index === -1) return { error: 'Event was not found.' };
  const job = jobs[index];
  if (
    job.status !== 'active' ||
    job.bookingType !== 'rental' ||
    !job.stylistsRequired
  ) {
    return {
      error: 'Stylist assignment is available only for an active rental event.',
    };
  }

  const selected = [...new Set(interestIds)];
  const approvedCount = job.stylistInterests.filter(
    (interest) => interest.status === 'approved',
  ).length;
  const remaining = Math.max(0, job.stylistsRequiredCount - approvedCount);
  if (remaining === 0)
    return { error: 'The required stylist count is already filled.' };
  if (selected.length !== remaining) {
    return {
      error: `Select exactly ${remaining} stylist${remaining === 1 ? '' : 's'} to complete this assignment.`,
    };
  }
  const selectableIds = new Set(
    job.stylistInterests
      .filter((interest) => interest.status === 'interested')
      .map((interest) => interest.id),
  );
  if (selected.some((id) => !selectableIds.has(id))) {
    return { error: 'One or more selected stylists are no longer available.' };
  }

  const now = new Date().toISOString();
  const selectedSet = new Set(selected);
  const interests = job.stylistInterests.map((interest) => {
    if (selectedSet.has(interest.id)) {
      return {
        ...interest,
        status: 'approved' as const,
        decidedAt: now,
        decidedBy,
      };
    }
    return interest.status === 'interested'
      ? { ...interest, status: 'rejected' as const, decidedAt: now, decidedBy }
      : interest;
  });
  let updated: EventJob = {
    ...job,
    stylistInterests: interests,
    updatedAt: now,
    activity: [
      activityEntry(
        decidedBy,
        'admin',
        'stylists_assigned',
        `${selected.length} stylist(s) assigned; requirement filled.`,
      ),
      ...job.activity,
    ],
  };
  updated = setStage(updated, 'stylist_opportunity', {
    status: 'done',
    completedAt: now,
    completedBy: decidedBy,
  });
  jobs[index] = updated;
  await writeAll([updated]);

  const selectedInterests = interests.filter((interest) =>
    selectedSet.has(interest.id),
  );
  await Promise.all(
    selectedInterests.map((interest) =>
      notifyAccount(
        job.id,
        interest.stylistAccountId,
        `You have been assigned to ${job.eventSummary.eventName} on ${job.eventSummary.eventDate}. Open My Assigned Events for details.`,
      ),
    ),
  );
  return { job: updated };
}

// Admin-only by construction: only called from a Supabase-authenticated admin Server
// Action (app/stylist-approvals/actions.ts), never reachable from the Staff Portal —
// so a stylist can never approve themselves.
export async function decideStylistInterest(
  jobId: string,
  interestId: string,
  decision: StylistInterestStatus,
  decidedBy: string,
) {
  const jobs = await readAll(jobId);
  const index = jobs.findIndex((job) => job.id === jobId);
  if (index === -1) return null;
  const job = jobs[index];
  if (job.bookingType !== 'rental' || !job.stylistsRequired) return null;
  const currentApprovedCount = job.stylistInterests.filter(
    (interest) => interest.status === 'approved',
  ).length;
  const currentInterest = job.stylistInterests.find(
    (interest) => interest.id === interestId,
  );
  if (
    decision === 'approved' &&
    currentInterest?.status !== 'approved' &&
    currentApprovedCount >= job.stylistsRequiredCount
  ) {
    return null;
  }
  const now = new Date().toISOString();
  const interests = job.stylistInterests.map((interest) =>
    interest.id === interestId
      ? { ...interest, status: decision, decidedAt: now, decidedBy }
      : interest,
  );
  let updated: EventJob = {
    ...job,
    stylistInterests: interests,
    activity: [
      activityEntry(
        decidedBy,
        'admin',
        'stylist_interest_decided',
        `${decision} for interest ${interestId}.`,
      ),
      ...job.activity,
    ],
    updatedAt: now,
  };
  const decidedInterest = interests.find(
    (interest) => interest.id === interestId,
  );
  if (decision === 'approved' && decidedInterest) {
    await notifyAccount(
      job.id,
      decidedInterest.stylistAccountId,
      `You're approved for ${job.eventSummary.eventName} (${job.id}) — see it under My Assigned Events.`,
    );
  }

  // Once enough stylists are approved, the Stylist opportunity stage closes on its own
  // (it is a parallel track — it never blocks Warehouse/QC/Collection/Booking stages).
  // Admins can still approve/reject/backup afterwards; this only marks the stage done.
  const approvedCount = interests.filter(
    (interest) => interest.status === 'approved',
  ).length;
  const requiredCount = Math.max(updated.stylistsRequiredCount, 1);
  const stage = findStage(updated, 'stylist_opportunity');
  if (
    decision === 'approved' &&
    stage &&
    stage.status !== 'done' &&
    approvedCount >= requiredCount
  ) {
    updated = {
      ...updated,
      stylistInterests: updated.stylistInterests.map((interest) =>
        interest.status === 'interested'
          ? {
              ...interest,
              status: 'rejected' as const,
              decidedAt: now,
              decidedBy,
            }
          : interest,
      ),
    };
    updated = setStage(updated, 'stylist_opportunity', {
      status: 'done',
      completedAt: now,
      completedBy: decidedBy,
    });
    updated = {
      ...updated,
      activity: [
        activityEntry(
          decidedBy,
          'admin',
          'stylist_opportunity_filled',
          `${approvedCount} stylist(s) approved.`,
        ),
        ...updated.activity,
      ],
    };
  }

  // Only the required number are meant to become officially assigned — approving past
  // that is allowed (an admin-intentional exception, e.g. a late replacement) but is
  // recorded explicitly rather than happening silently.
  if (decision === 'approved' && approvedCount > requiredCount) {
    updated = {
      ...updated,
      activity: [
        activityEntry(
          decidedBy,
          'admin',
          'stylist_approved_beyond_required',
          `${approvedCount} approved vs ${requiredCount} required — treated as an intentional exception.`,
        ),
        ...updated.activity,
      ],
    };
  }

  jobs[index] = updated;
  await writeAll([updated]);
  return updated;
}

export async function setStylistsRequiredCount(jobId: string, count: number) {
  const jobs = await readAll(jobId);
  const index = jobs.findIndex((job) => job.id === jobId);
  if (index === -1) return null;
  if (jobs[index].bookingType !== 'rental') return null;
  if (!Number.isInteger(count) || count < 0) return null;
  const approvedCount = jobs[index].stylistInterests.filter(
    (interest) => interest.status === 'approved',
  ).length;
  if (count < approvedCount) return null;
  jobs[index] = {
    ...jobs[index],
    stylistsRequiredCount: count,
    updatedAt: new Date().toISOString(),
  };
  await writeAll([jobs[index]]);
  return jobs[index];
}

// Jobs where THIS stylist has an APPROVED interest, regardless of whether the parallel
// stylist_opportunity stage itself is still open (it closes once enough stylists are
// approved — see decideStylistInterest) or the job's other stages have moved on. This
// is the "My Assigned Events" list — separate from the "available opportunities" list
// in jobsForDepartment('stylist'), which only shows OPEN opportunities to express
// interest in.
export async function assignedJobsForStylist(
  stylistAccountId: string,
): Promise<EventJob[]> {
  return (await readAllForStylistWorkflow()).filter(
    (job) =>
      job.bookingType === 'rental' &&
      job.stylistInterests.some(
        (interest) =>
          interest.stylistAccountId === stylistAccountId &&
          interest.status === 'approved',
      ),
  );
}

export async function stylistJobsForAccount(
  stylistAccountId: string,
): Promise<EventJob[]> {
  return (await readAllForStylistWorkflow()).filter((job) => {
    if (
      job.bookingType !== 'rental' ||
      !job.stylistsRequired ||
      job.status !== 'active'
    )
      return false;
    const stage = findStage(job, 'stylist_opportunity');
    const hasOwnInterest = job.stylistInterests.some(
      (interest) => interest.stylistAccountId === stylistAccountId,
    );
    return (
      hasOwnInterest ||
      Boolean(stage && ['open', 'in_progress'].includes(stage.status))
    );
  });
}

// The Stylist Main ID supervises the complete stylist queue, matching the
// original workflow.
export async function stylistJobsForMainAccount(): Promise<EventJob[]> {
  return stylistJobsForAdmin();
}

export async function stylistJobForAccount(
  jobId: string,
  stylistAccountId: string,
  viewAll = false,
): Promise<EventJob | null> {
  return (
    (
      await (viewAll
        ? stylistJobsForMainAccount()
        : stylistJobsForAccount(stylistAccountId))
    ).find((job) => job.id === jobId) ?? null
  );
}

export async function stylistJobsForAdmin(): Promise<EventJob[]> {
  return (await readAllForStylistWorkflow()).filter(
    (job) => job.bookingType === 'rental' && job.stylistsRequired,
  );
}

// ---- Step 8: Travel Manager (admin/franchise-admin only) -----------------------

export type TravelPlanResult = { job?: EventJob; error?: string };

// Admin-only by construction: only imported from app/travel/actions.ts (a
// Supabase-authenticated admin Server Action), never from anything under
// app/staff-portal/. Stylists can only ever VIEW their own plan (see
// assignedJobsForStylist / the stylist "My Assigned Events" page), never edit it.
export async function upsertTravelPlan(
  jobId: string,
  interestId: string,
  data: {
    travelLegs: StylistTravelLeg[];
    accommodation: StylistAccommodation | null;
  },
  updatedBy: string,
): Promise<TravelPlanResult> {
  const jobs = await readAll(jobId);
  const index = jobs.findIndex((job) => job.id === jobId);
  if (index === -1) return { error: 'Job not found.' };
  const job = jobs[index];
  if (job.bookingType !== 'rental')
    return { error: 'Travel is available only for rental bookings.' };
  const interest = job.stylistInterests.find(
    (entry) => entry.id === interestId,
  );
  if (!interest) return { error: 'Stylist assignment not found on this job.' };
  if (interest.status !== 'approved') {
    return {
      error: 'Travel & accommodation can only be set for an approved stylist.',
    };
  }

  const now = new Date().toISOString();
  const existingPlan = job.travelPlans.find(
    (plan) => plan.interestId === interestId,
  );
  const plan = {
    interestId,
    stylistAccountId: interest.stylistAccountId,
    stylistName: interest.stylistName,
    travelLegs: data.travelLegs,
    accommodation: data.accommodation,
    updatedAt: now,
    updatedBy,
  };
  const travelPlans = existingPlan
    ? job.travelPlans.map((entry) =>
        entry.interestId === interestId ? plan : entry,
      )
    : [...job.travelPlans, plan];

  const updated: EventJob = {
    ...job,
    travelPlans,
    updatedAt: now,
    activity: [
      activityEntry(
        updatedBy,
        'admin',
        'stylist_travel_updated',
        `Travel/accommodation updated for ${interest.stylistName}.`,
      ),
      ...job.activity,
    ],
  };
  jobs[index] = updated;
  await writeAll([updated]);
  return { job: updated };
}

export async function confirmStylistTicketSent(
  jobId: string,
  interestId: string,
  confirmedBy: string,
  // When set, an admin has actually uploaded a ticket document (see
  // uploadTicketAction in app/travel/actions.ts) -- otherwise this is the
  // older manual "I sent it on WhatsApp" confirmation with no file attached.
  // A new upload always re-notifies (even if a ticket was already confirmed
  // before), since it means there's a new document for the stylist to see.
  ticketFile?: { path: string; name: string },
): Promise<TravelPlanResult> {
  const jobs = await readAll(jobId);
  const index = jobs.findIndex((job) => job.id === jobId);
  if (index === -1) return { error: 'Job not found.' };
  const job = jobs[index];
  if (job.bookingType !== 'rental')
    return { error: 'Tickets are available only for rental bookings.' };
  const interest = job.stylistInterests.find(
    (entry) => entry.id === interestId,
  );
  if (!interest || interest.status !== 'approved') {
    return {
      error:
        'Only an approved staff assignment can receive a ticket confirmation.',
    };
  }

  const existingPlan = job.travelPlans.find(
    (plan) => plan.interestId === interestId,
  );
  if (existingPlan?.ticketConfirmedAt && !ticketFile) return { job };

  const now = new Date().toISOString();
  const plan = {
    interestId,
    stylistAccountId: interest.stylistAccountId,
    stylistName: interest.stylistName,
    travelLegs: existingPlan?.travelLegs ?? [],
    accommodation: existingPlan?.accommodation ?? null,
    ticketConfirmedAt: now,
    ticketConfirmedBy: confirmedBy,
    ticketFilePath: ticketFile?.path ?? existingPlan?.ticketFilePath ?? null,
    ticketFileName: ticketFile?.name ?? existingPlan?.ticketFileName ?? null,
    updatedAt: now,
    updatedBy: confirmedBy,
  };
  const travelPlans = existingPlan
    ? job.travelPlans.map((entry) =>
        entry.interestId === interestId ? plan : entry,
      )
    : [...job.travelPlans, plan];
  const updated: EventJob = {
    ...job,
    travelPlans,
    updatedAt: now,
    activity: [
      activityEntry(
        confirmedBy,
        'admin',
        'stylist_ticket_confirmed',
        ticketFile
          ? `Ticket "${ticketFile.name}" uploaded and sent to ${interest.stylistName}.`
          : `Ticket confirmed and sent on WhatsApp to ${interest.stylistName}.`,
      ),
      ...job.activity,
    ],
  };
  jobs[index] = updated;
  await writeAll([updated]);
  await notifyAccount(
    job.id,
    interest.stylistAccountId,
    ticketFile
      ? `You're selected for ${job.eventSummary.eventName} (${job.id}). Your travel ticket has been uploaded — open Travel & Tickets in your portal to view it.`
      : `Your ticket for ${job.eventSummary.eventName} (${job.id}) is confirmed and has been sent to you on WhatsApp.`,
  );
  return { job: updated };
}

// ---- Step 9: Event day / stylist execution -------------------------------------

export type ExecutionAction = 'reached_venue' | 'start_work' | 'complete_work';
export type ExecutionResult = { job?: EventJob; error?: string };

const EXECUTION_ORDER: Record<ExecutionAction, StylistExecutionStatus> = {
  reached_venue: 'reached_venue',
  start_work: 'work_started',
  complete_work: 'work_completed',
};

// Reached Venue (OTP verified) -> Work Done, with older in-progress records supported. Only updates this
// stylist's own execution entry — never creates another job, never touches
// job.status, and never closes the Event Job (only Booking staff can do that).
export async function recordStylistExecution(
  jobId: string,
  stylistAccountId: string,
  stylistName: string,
  action: ExecutionAction,
  remarks: string,
): Promise<ExecutionResult> {
  const jobs = await readAll(jobId);
  const index = jobs.findIndex((job) => job.id === jobId);
  if (index === -1) return { error: 'Job not found.' };
  const job = jobs[index];
  const isApproved = job.stylistInterests.some(
    (interest) =>
      interest.stylistAccountId === stylistAccountId &&
      interest.status === 'approved',
  );
  if (!isApproved)
    return { error: 'You are not an approved stylist on this job.' };

  const now = new Date().toISOString();
  const existing = job.stylistExecutions.find(
    (entry) => entry.stylistAccountId === stylistAccountId,
  );
  const currentStatus: StylistExecutionStatus =
    existing?.status ?? 'not_started';

  const nextAllowed: Record<StylistExecutionStatus, ExecutionAction | null> = {
    not_started: 'reached_venue',
    reached_venue: 'complete_work',
    work_started: 'complete_work',
    work_completed: null,
  };
  if (nextAllowed[currentStatus] !== action) {
    return { error: 'That action is not available from the current status.' };
  }

  const nextStatus = EXECUTION_ORDER[action];
  const entry = {
    interestId:
      job.stylistInterests.find(
        (interest) => interest.stylistAccountId === stylistAccountId,
      )?.id ?? '',
    stylistAccountId,
    stylistName,
    status: nextStatus,
    reachedAt: action === 'reached_venue' ? now : (existing?.reachedAt ?? null),
    startedAt: action === 'start_work' ? now : (existing?.startedAt ?? null),
    completedAt:
      action === 'complete_work' ? now : (existing?.completedAt ?? null),
    remarks: remarks || existing?.remarks || '',
  };
  const stylistExecutions = existing
    ? job.stylistExecutions.map((item) =>
        item.stylistAccountId === stylistAccountId ? entry : item,
      )
    : [...job.stylistExecutions, entry];

  let updated: EventJob = {
    ...job,
    stylistExecutions,
    updatedAt: now,
    activity: [
      activityEntry(
        stylistName,
        'stylist',
        `stylist_${action}`,
        remarks || undefined,
      ),
      ...job.activity,
    ],
  };
  if (action === 'complete_work' && job.bookingType === 'rental') {
    const collection = findStage(updated, 'collection');
    if (collection?.status === 'not_started') {
      updated = setStage(updated, 'collection', {
        status: 'open',
        openedAt: now,
      });
    }
  }
  jobs[index] = updated;
  await writeAll([updated]);
  return { job: updated };
}

// ---- Step 10: Collection (post-event check-in) ---------------------------------

export type CollectionResult = { job?: EventJob; error?: string };

export async function submitCollectionCheck(
  jobId: string,
  items: CollectionItemCheck[],
  staffName: string,
  handover: {
    collectedFrom: string;
    handedOverTo: string;
    handoverNotes: string;
  },
): Promise<CollectionResult> {
  const jobs = await readAll(jobId);
  const index = jobs.findIndex((job) => job.id === jobId);
  if (index === -1) return { error: 'Job not found.' };
  const job = jobs[index];
  if (job.bookingType !== 'rental') {
    return { error: 'Collection is available only for rental orders.' };
  }
  const stage = findStage(job, 'collection');
  if (
    !job.stylistExecutions.some((entry) => entry.status === 'work_completed')
  ) {
    return {
      error: 'Collection opens after the stylist marks the event work done.',
    };
  }
  if (!stage || (stage.status !== 'open' && stage.status !== 'in_progress')) {
    return { error: 'Collection is not open for this job yet.' };
  }
  if (
    items.some(
      (item) =>
        item.returnedQuantity === null ||
        !Number.isInteger(item.returnedQuantity) ||
        item.returnedQuantity < 0 ||
        item.returnedQuantity > item.sentQuantity,
    )
  ) {
    return {
      error:
        'Collected quantities must be whole numbers between 0 and the sent quantity.',
    };
  }
  if (!handover.collectedFrom.trim() || !handover.handedOverTo.trim()) {
    return {
      error: 'Enter who handed over the products and who received them.',
    };
  }
  const normalizedItems = items.map((item) => ({
    ...item,
    shortQuantity:
      item.shortQuantity || (item.returnedQuantity ?? 0) < item.sentQuantity,
  }));
  if (
    normalizedItems.some(
      (item) =>
        (item.visibleDamage ||
          item.wrongProduct ||
          item.clientHoldingItem ||
          item.shortQuantity) &&
        !item.remarks.trim() &&
        !item.evidenceNote.trim(),
    )
  ) {
    return {
      error:
        'Add a short remark for every missing, damaged, held, or incorrect product.',
    };
  }

  const now = new Date().toISOString();
  // Collection only confirms what physically came back — it never writes to inventory
  // and never decides final client charges (those happen at Return QC / Booking Final
  // Check). See SUPABASE_CONNECTION_PENDING.md.
  let updated: EventJob = {
    ...job,
    collectionCheck: {
      items: normalizedItems,
      collectedFrom: handover.collectedFrom.trim(),
      handedOverTo: handover.handedOverTo.trim(),
      handoverNotes: handover.handoverNotes.trim(),
      handoverConfirmedAt: now,
      completedAt: now,
      completedBy: staffName,
    },
  };
  updated = setStage(updated, 'collection', {
    status: 'done',
    completedAt: now,
    completedBy: staffName,
  });
  updated = setStage(updated, 'return_quality_check', {
    status: 'open',
    openedAt: now,
  });
  await notifyDepartment(
    job.id,
    'qc',
    `${job.id} — Collection complete, Return QC is ready.`,
  );
  const missing = normalizedItems.reduce(
    (sum, item) =>
      sum + Math.max(item.sentQuantity - (item.returnedQuantity ?? 0), 0),
    0,
  );
  updated = {
    ...updated,
    updatedAt: now,
    activity: [
      activityEntry(
        staffName,
        'collection',
        'collection_completed',
        missing
          ? `${missing} item(s) not returned.`
          : 'Everything sent was returned.',
      ),
      ...updated.activity,
    ],
  };
  jobs[index] = updated;
  await writeAll([updated]);
  return { job: updated };
}

// ---- Step 11: Return QC (same QC work area, kept separate from pre-event QC) ---

export type ReturnQcResult = { job?: EventJob; error?: string };

export async function submitReturnQualityCheck(
  jobId: string,
  items: ReturnQcItemCheck[],
  staffName: string,
  proofPhotoPaths: string[] = [],
): Promise<ReturnQcResult> {
  const jobs = await readAll(jobId);
  const index = jobs.findIndex((job) => job.id === jobId);
  if (index === -1) return { error: 'Job not found.' };
  const job = jobs[index];
  if (job.bookingType !== 'rental') {
    return {
      error: 'Return Quality Check is available only for rental bookings.',
    };
  }
  const stage = findStage(job, 'return_quality_check');
  if (!stage || (stage.status !== 'open' && stage.status !== 'in_progress')) {
    return { error: 'Return QC is not open for this job yet.' };
  }
  if (
    items.some(
      (item) => item.goodQuantity === null || item.damagedQuantity === null,
    )
  ) {
    return {
      error: 'Enter a good quantity and a damaged quantity for every item.',
    };
  }
  if (
    items.some(
      (item) =>
        !Number.isInteger(item.goodQuantity) ||
        !Number.isInteger(item.damagedQuantity) ||
        (item.goodQuantity ?? 0) < 0 ||
        (item.damagedQuantity ?? 0) < 0 ||
        (item.goodQuantity ?? 0) + (item.damagedQuantity ?? 0) !==
          item.returnedQuantity,
    )
  ) {
    return {
      error:
        'Good + damaged quantity must exactly match the collected quantity for every product.',
    };
  }
  const hasIssue = items.some(
    (item) =>
      (item.damagedQuantity ?? 0) > 0 || item.repairRequired || item.unusable,
  );
  if (hasIssue && proofPhotoPaths.length === 0) {
    return {
      error:
        'Add at least one proof photo when a returned product has an issue.',
    };
  }
  if (
    items.some(
      (item) =>
        ((item.damagedQuantity ?? 0) > 0 ||
          item.repairRequired ||
          item.unusable) &&
        !item.remarks.trim() &&
        !item.evidenceNote.trim(),
    )
  ) {
    return {
      error: 'Add a remark for every damaged, repair, or unusable product.',
    };
  }

  const now = new Date().toISOString();
  // Return QC determines product condition only — it never decides client payment (that
  // stays with Booking Final Check) and it never overwrites the pre-event `qualityCheck`
  // record, which is kept as separate history.
  let updated: EventJob = {
    ...job,
    returnQualityCheck: {
      items,
      proofPhotoPaths,
      completedAt: now,
      completedBy: staffName,
    },
  };
  updated = setStage(updated, 'return_quality_check', {
    status: 'done',
    completedAt: now,
    completedBy: staffName,
  });
  updated = setStage(updated, 'return_warehouse', {
    status: 'open',
    openedAt: now,
  });
  const damaged = items.reduce(
    (sum, item) => sum + (item.damagedQuantity ?? 0),
    0,
  );
  updated = {
    ...updated,
    updatedAt: now,
    activity: [
      activityEntry(
        staffName,
        'qc',
        'return_quality_check_completed',
        damaged
          ? `${damaged} item(s) came back damaged.`
          : 'Everything returned came back in good condition.',
      ),
      ...updated.activity,
    ],
  };
  jobs[index] = updated;
  await writeAll([updated], { expectedUpdatedAt: job.updatedAt });
  await notifyDepartment(
    job.id,
    'warehouse',
    `${job.id} — Return QC complete, Return Warehouse is ready.`,
  ).catch((error) =>
    console.error('[event-jobs] Return Warehouse notification failed', error),
  );
  return { job: updated };
}

// ---- Step 12: Return Warehouse + inventory disposition -------------------------

export type ReturnWarehouseResult = { job?: EventJob; error?: string };

export async function submitReturnWarehouseCheck(
  jobId: string,
  items: ReturnWarehouseItemResult[],
  staffName: string,
  receiving: {
    receivedFrom: string;
    receivingNotes: string;
    handoverConfirmed: boolean;
  },
): Promise<ReturnWarehouseResult> {
  const jobs = await readAll(jobId);
  const index = jobs.findIndex((job) => job.id === jobId);
  if (index === -1) return { error: 'Job not found.' };
  const job = jobs[index];
  if (job.bookingType !== 'rental') {
    return { error: 'Return Warehouse is available only for rental bookings.' };
  }
  const stage = findStage(job, 'return_warehouse');
  if (!stage || (stage.status !== 'open' && stage.status !== 'in_progress')) {
    return { error: 'Return Warehouse is not open for this job yet.' };
  }
  if (!job.returnQualityCheck) {
    return { error: 'Return QC must be completed before Warehouse receiving.' };
  }
  if (!receiving.handoverConfirmed || !receiving.receivedFrom.trim()) {
    return {
      error:
        'Enter who handed over the products and confirm physical receiving.',
    };
  }
  if (
    items.some(
      (item) =>
        !Number.isInteger(item.usableQuantity) ||
        !Number.isInteger(item.damagedRepairQuantity) ||
        !Number.isInteger(item.missingLostQuantity) ||
        item.usableQuantity < 0 ||
        item.damagedRepairQuantity < 0 ||
        item.missingLostQuantity < 0,
    )
  ) {
    return {
      error: 'Return Warehouse quantities must be non-negative whole numbers.',
    };
  }
  for (const item of items) {
    const qcItem = job.returnQualityCheck.items.find(
      (entry) => entry.itemName === item.itemName,
    );
    const collectedItem = job.collectionCheck?.items.find(
      (entry) => entry.itemName === item.itemName,
    );
    const receivedQuantity =
      (qcItem?.goodQuantity ?? 0) + (qcItem?.damagedQuantity ?? 0);
    const missingQuantity = collectedItem
      ? Math.max(
          collectedItem.sentQuantity - (collectedItem.returnedQuantity ?? 0),
          0,
        )
      : 0;
    if (
      item.usableQuantity + item.damagedRepairQuantity !== receivedQuantity ||
      item.missingLostQuantity !== missingQuantity
    ) {
      return {
        error: `Confirm the Return QC quantities for ${item.itemName} without changing the totals.`,
      };
    }
    if (item.usableQuantity > 0 && !item.storageLocation?.trim()) {
      return {
        error: `Enter the storage or rack location for ${item.itemName}.`,
      };
    }
    if (
      (item.damagedRepairQuantity > 0 || item.missingLostQuantity > 0) &&
      !item.remarks.trim()
    ) {
      return {
        error: `Add a remark for the damaged or missing quantity of ${item.itemName}.`,
      };
    }
  }

  const now = new Date().toISOString();
  // NOTE (mock-layer limitation, documented in SUPABASE_CONNECTION_PENDING.md): this
  // records the usable/damaged/missing split for admin visibility, but there is no real
  // inventory table in this project yet for any stage to write back to — so "not
  // automatically restocking the full sent quantity" is trivially true today. The real
  // backend phase must wire `items[].usableQuantity` into actual product stock, not the
  // full original quantity, per the user's explicit instruction.
  let updated: EventJob = {
    ...job,
    returnWarehouseCheck: {
      items,
      receivedFrom: receiving.receivedFrom.trim(),
      receivingNotes: receiving.receivingNotes.trim(),
      receivedConfirmedAt: now,
      completedAt: now,
      completedBy: staffName,
    },
  };
  updated = setStage(updated, 'return_warehouse', {
    status: 'done',
    completedAt: now,
    completedBy: staffName,
  });
  updated = setStage(updated, 'booking_final_check', {
    status: 'open',
    openedAt: now,
  });
  updated = {
    ...updated,
    updatedAt: now,
    activity: [
      activityEntry(
        staffName,
        'warehouse',
        'return_warehouse_completed',
        'Returned stock sorted into usable/damaged/missing.',
      ),
      ...updated.activity,
    ],
  };
  jobs[index] = updated;
  await writeAll([updated], { expectedUpdatedAt: job.updatedAt });
  await notifyDepartment(
    job.id,
    'booking',
    `${job.id} — Return Warehouse complete. Ready for Final Closure.`,
  ).catch((error) =>
    console.error(
      '[event-jobs] Booking Final Check notification failed',
      error,
    ),
  );
  return { job: updated };
}

// ---- Step 13: Booking Final Check + Close Event --------------------------------

export type CloseEventInput = {
  paymentComplete: boolean;
  depositSettled: boolean;
  damageLossAcknowledged: boolean;
  refundAmount: number;
  additionalPaymentAmount: number;
  notes: string;
};

export type CloseEventResult = { job?: EventJob; error?: string };

// Admin-only... no — BOOKING-department-only by construction: only ever imported from
// app/staff-portal/booking/actions.ts, never from any other department's actions file
// and never from the admin app/event-jobs/actions.ts. This is the ONLY function in the
// whole mock layer allowed to set `status: 'closed'` — every other stage-completion
// function above stops at marking its own stage `done`.
export async function closeEventJob(
  jobId: string,
  input: CloseEventInput,
  closedBy: string,
): Promise<CloseEventResult> {
  const jobs = await readAll(jobId);
  const index = jobs.findIndex((job) => job.id === jobId);
  if (index === -1) return { error: 'Job not found.' };
  const job = jobs[index];

  // Prevent accidental duplicate closure.
  if (job.status === 'closed') {
    return { error: 'This Event Job is already closed.' };
  }

  const requiredDoneStages: EventJobStageKey[] = [
    'warehouse_pick',
    'quality_check',
    'packing',
    ...(job.bookingType === 'rental'
      ? ([
          'collection',
          'return_quality_check',
          'return_warehouse',
        ] as EventJobStageKey[])
      : []),
  ];
  const incompleteStage = requiredDoneStages.find(
    (key) => findStage(job, key)?.status !== 'done',
  );
  if (incompleteStage) {
    return {
      error: `${STAGE_LABEL[incompleteStage]} must be completed before the event can be closed.`,
    };
  }
  if (job.stylistsRequired) {
    const stylistStage = findStage(job, 'stylist_opportunity');
    const approvedCount = job.stylistInterests.filter(
      (interest) => interest.status === 'approved',
    ).length;
    if (
      stylistStage?.status !== 'done' &&
      approvedCount < job.stylistsRequiredCount
    ) {
      return { error: 'Stylist assignment is not complete for this job yet.' };
    }
  }
  const bookingFinalCheckStage = findStage(job, 'booking_final_check');
  if (
    !bookingFinalCheckStage ||
    (bookingFinalCheckStage.status !== 'open' &&
      bookingFinalCheckStage.status !== 'in_progress')
  ) {
    return { error: 'Booking Final Check is not open for this job yet.' };
  }
  const unresolvedIssue = job.issues.some((issue) => !issue.resolved);
  if (unresolvedIssue) {
    return { error: 'Resolve all open issues before closing the event.' };
  }
  if (
    !input.paymentComplete ||
    !input.depositSettled ||
    !input.damageLossAcknowledged
  ) {
    return {
      error:
        'Confirm payment, deposit and damage/loss acknowledgement before closing the event.',
    };
  }
  if (
    !Number.isFinite(input.refundAmount) ||
    !Number.isFinite(input.additionalPaymentAmount) ||
    input.refundAmount < 0 ||
    input.additionalPaymentAmount < 0
  ) {
    return {
      error: 'Payment and refund amounts must be valid positive values.',
    };
  }
  const pendingBalance = Math.max(job.paymentSummary?.pendingBalance ?? 0, 0);
  if (input.additionalPaymentAmount < pendingBalance) {
    return {
      error: `₹${pendingBalance.toLocaleString('en-IN')} is still pending. Record the full amount before closing.`,
    };
  }
  const depositAmount = Math.max(job.paymentSummary?.depositAmount ?? 0, 0);
  if (input.refundAmount > depositAmount) {
    return {
      error: 'Refund cannot be higher than the recorded security deposit.',
    };
  }

  const now = new Date().toISOString();
  const bookingFinalCheck: BookingFinalCheck = {
    paymentComplete: input.paymentComplete,
    depositSettled: input.depositSettled,
    damageLossAcknowledged: input.damageLossAcknowledged,
    refundAmount: input.refundAmount,
    additionalPaymentAmount: input.additionalPaymentAmount,
    notes: input.notes,
    completedAt: now,
    completedBy: closedBy,
  };

  let updated: EventJob = {
    ...job,
    status: 'closed',
    closedAt: now,
    bookingFinalCheck,
  };
  updated = setStage(updated, 'booking_final_check', {
    status: 'done',
    completedAt: now,
    completedBy: closedBy,
  });
  updated = {
    ...updated,
    updatedAt: now,
    activity: [
      activityEntry(
        closedBy,
        'booking',
        'event_job_closed',
        'Event Job closed after final booking check.',
      ),
      ...updated.activity,
    ],
  };

  // Record performance in the same transaction as job and booking closure.
  const credits: {
    identifier: string;
    name: string;
    department: StaffDepartment;
  }[] = [];
  const addCredit = (
    department: StaffDepartment,
    name: string,
    identifier = name,
  ) =>
    credits.push({
      identifier: `${department}:${identifier}`,
      name,
      department,
    });
  if (!updated.performanceCredited) {
    if (updated.warehousePrep?.completedBy)
      addCredit('warehouse', updated.warehousePrep.completedBy);
    if (updated.returnWarehouseCheck?.completedBy)
      addCredit('warehouse', updated.returnWarehouseCheck.completedBy);
    if (updated.qualityCheck?.completedBy)
      addCredit('qc', updated.qualityCheck.completedBy);
    if (updated.packingChecklist?.completedBy)
      addCredit('qc', updated.packingChecklist.completedBy);
    if (updated.returnQualityCheck?.completedBy)
      addCredit('qc', updated.returnQualityCheck.completedBy);
    if (updated.collectionCheck?.completedBy)
      addCredit('collection', updated.collectionCheck.completedBy);
    for (const interest of updated.stylistInterests) {
      if (interest.status === 'approved')
        addCredit('stylist', interest.stylistName, interest.stylistAccountId);
    }
    addCredit('booking', closedBy);
    updated = { ...updated, performanceCredited: true };
  }

  jobs[index] = updated;
  await writeAll([updated], {
    expectedUpdatedAt: job.updatedAt,
    afterWrite: async (tx) => {
      const [booking] = await tx<
        { owner_id: string; total: string; paid_amount: string }[]
      >`
      select owner_id, total, paid_amount from public.bookings where id = ${updated.bookingId}
    `;
      if (!booking) throw new Error('Booking not found.');
      if (input.additionalPaymentAmount > 0) {
        await tx`
        insert into public.booking_payments (owner_id, booking_id, amount, payment_method, reference_number, notes)
        values (
          ${booking.owner_id}, ${updated.bookingId}, ${input.additionalPaymentAmount}, 'other',
          ${`Final settlement ${updated.id}`}, ${input.notes || 'Recorded during Event Job closure'}
        )
      `;
      }
      const adjustedPaid = Math.max(
        Number(booking.paid_amount) +
          input.additionalPaymentAmount -
          input.refundAmount,
        0,
      );
      const adjustedBalance = Math.max(Number(booking.total) - adjustedPaid, 0);
      const paymentStatus =
        input.refundAmount > 0 && adjustedPaid === 0
          ? 'refunded'
          : adjustedBalance === 0
            ? 'paid'
            : adjustedPaid > 0
              ? 'partial'
              : 'unpaid';
      await tx`
      update public.bookings set status = 'completed', paid_amount = ${adjustedPaid},
        balance_amount = ${adjustedBalance}, payment_status = ${paymentStatus}
      where id = ${updated.bookingId}
    `;
      await tx`
      insert into public.booking_activity (owner_id, booking_id, action, details)
      values (
        ${booking.owner_id}, ${updated.bookingId}, 'event_job_closed',
        ${tx.json({
          event_job_id: updated.id,
          additional_payment: input.additionalPaymentAmount,
          refund: input.refundAmount,
          closed_by: closedBy,
        })}
      )
    `;
      for (const credit of credits) {
        const rawIdentifier = credit.identifier.slice(
          credit.department.length + 1,
        );
        await tx`
        insert into public.staff_performance_credits (staff_id, identifier, name, department, event_job_id)
        values (
          (
            select sm.id
            from public.staff_members sm
            where (
              sm.user_id::text = ${rawIdentifier}
              or lower(sm.login_id) = lower(${rawIdentifier})
              or lower(sm.name) = lower(${credit.name})
            )
              and exists (
                select 1 from public.staff_departments sd
                where sd.staff_id = sm.id and sd.department = ${credit.department}
              )
            order by
              (sm.user_id::text = ${rawIdentifier}) desc,
              (lower(sm.login_id) = lower(${rawIdentifier})) desc,
              sm.id
            limit 1
          ),
          ${credit.identifier}, ${credit.name}, ${credit.department}, ${updated.id}
        )
        on conflict (identifier, event_job_id, department) do nothing
      `;
      }
    },
  });
  for (const department of [
    'warehouse',
    'qc',
    'collection',
    'booking',
  ] as const) {
    await notifyDepartment(
      updated.id,
      department,
      `${updated.eventSummary.eventName} (${updated.id}) is now closed.`,
    ).catch((error) =>
      console.error('[event-jobs] closure notification failed', error),
    );
  }
  for (const interest of updated.stylistInterests) {
    if (interest.status === 'approved') {
      await notifyAccount(
        updated.id,
        interest.stylistAccountId,
        `${updated.eventSummary.eventName} (${updated.id}) is now closed. Thank you!`,
      ).catch((error) =>
        console.error(
          '[event-jobs] stylist closure notification failed',
          error,
        ),
      );
    }
  }
  return { job: updated };
}

// ---- Step 14: Admin Master Event Job overview -----------------------------------

export type JobOverviewRow = {
  label: string;
  value: string;
  tone: 'done' | 'pending' | 'attention' | 'neutral';
};

function stageTone(
  status: EventJob['stages'][number]['status'],
): JobOverviewRow['tone'] {
  if (status === 'done') return 'done';
  if (status === 'blocked') return 'attention';
  if (status === 'open' || status === 'in_progress') return 'pending';
  return 'neutral';
}

function stageValue(status: EventJob['stages'][number]['status']): string {
  if (status === 'done') return 'Completed';
  if (status === 'open') return 'Open';
  if (status === 'in_progress') return 'In progress';
  if (status === 'blocked') return 'Blocked';
  return 'Not started';
}

// Pure/no I/O — the "at a glance" summary for the admin Master Event Job page. Every
// row answers one of the questions in the Step 14 brief (where's the job, what's
// pending, are stylists assigned, is travel ready, can it close, etc).
export function buildJobOverview(job: EventJob): JobOverviewRow[] {
  const get = (key: EventJobStageKey) =>
    findStage(job, key)?.status ?? 'not_started';
  const qcPackingStatus =
    get('quality_check') === 'done' && get('packing') === 'done'
      ? 'done'
      : get('quality_check') === 'not_started'
        ? 'not_started'
        : 'open';

  const rows: JobOverviewRow[] = [
    { label: 'Booking', value: 'Confirmed', tone: 'done' },
    {
      label: 'Warehouse',
      value: stageValue(get('warehouse_pick')),
      tone: stageTone(get('warehouse_pick')),
    },
    {
      label: 'QC & Packing',
      value:
        qcPackingStatus === 'done'
          ? 'Completed'
          : qcPackingStatus === 'not_started'
            ? 'Not started'
            : 'In progress',
      tone:
        qcPackingStatus === 'done'
          ? 'done'
          : qcPackingStatus === 'not_started'
            ? 'neutral'
            : 'pending',
    },
  ];

  if (job.stylistsRequired) {
    const approvedCount = job.stylistInterests.filter(
      (interest) => interest.status === 'approved',
    ).length;
    rows.push({
      label: 'Stylist',
      value: `${approvedCount}/${job.stylistsRequiredCount} Assigned`,
      tone: approvedCount >= job.stylistsRequiredCount ? 'done' : 'pending',
    });
    const travelReady = job.travelPlans.some(
      (plan) => plan.travelLegs.length > 0 || plan.accommodation,
    );
    rows.push({
      label: 'Travel',
      value:
        approvedCount === 0
          ? 'Not applicable yet'
          : travelReady
            ? 'Ready'
            : 'Pending',
      tone:
        approvedCount === 0 ? 'neutral' : travelReady ? 'done' : 'attention',
    });
  } else {
    rows.push({ label: 'Stylist', value: 'Not required', tone: 'neutral' });
  }

  rows.push({
    label: 'Event',
    value: get('collection') === 'not_started' ? 'Upcoming' : 'Completed',
    tone: get('collection') === 'not_started' ? 'pending' : 'done',
  });
  rows.push({
    label: 'Collection',
    value: stageValue(get('collection')),
    tone: stageTone(get('collection')),
  });
  rows.push({
    label: 'Return QC',
    value: stageValue(get('return_quality_check')),
    tone: stageTone(get('return_quality_check')),
  });
  rows.push({
    label: 'Return Warehouse',
    value: stageValue(get('return_warehouse')),
    tone: stageTone(get('return_warehouse')),
  });
  rows.push({
    label: 'Settlement',
    value: job.bookingFinalCheck?.paymentComplete ? 'Completed' : 'Pending',
    tone: job.bookingFinalCheck?.paymentComplete ? 'done' : 'pending',
  });
  rows.push({
    label: 'Final Closure',
    value:
      job.status === 'closed'
        ? 'Completed'
        : get('booking_final_check') === 'not_started'
          ? 'Not yet'
          : 'Pending',
    tone: job.status === 'closed' ? 'done' : 'pending',
  });

  return rows;
}

// True only when every gate closeEventJob() itself checks is satisfied — used to show
// (or hide) the Close Event button/state before the booking staff even opens the form.
export function canCloseEventJob(job: EventJob): boolean {
  if (job.status === 'closed') return false;
  const requiredDoneStages: EventJobStageKey[] = [
    'warehouse_pick',
    'quality_check',
    'packing',
    ...(job.bookingType === 'rental'
      ? ([
          'collection',
          'return_quality_check',
          'return_warehouse',
        ] as EventJobStageKey[])
      : []),
  ];
  if (requiredDoneStages.some((key) => findStage(job, key)?.status !== 'done'))
    return false;
  if (job.stylistsRequired) {
    const approvedCount = job.stylistInterests.filter(
      (interest) => interest.status === 'approved',
    ).length;
    const stylistStage = findStage(job, 'stylist_opportunity');
    if (
      stylistStage?.status !== 'done' &&
      approvedCount < job.stylistsRequiredCount
    )
      return false;
  }
  const bookingFinalCheckStage = findStage(job, 'booking_final_check');
  if (
    !bookingFinalCheckStage ||
    (bookingFinalCheckStage.status !== 'open' &&
      bookingFinalCheckStage.status !== 'in_progress')
  ) {
    return false;
  }
  if (job.issues.some((issue) => !issue.resolved)) return false;
  return true;
}
