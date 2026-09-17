import type { EventJobStageKey, EventJobStageStatus } from './constants';

export type EventJobStage = {
  key: EventJobStageKey;
  status: EventJobStageStatus;
  assignedStaffId: string | null;
  openedAt: string | null;
  completedAt: string | null;
  completedBy: string | null;
  notes: string;
};

export type EventJobIssue = {
  id: string;
  stage: EventJobStageKey | null;
  description: string;
  raisedBy: string;
  raisedAt: string;
  resolved: boolean;
  resolvedAt: string | null;
};

// `department` records WHO acted, structurally, alongside the free-text `actor` name —
// 'admin' for anything done from the Admin Portal, 'system' for automated
// transitions (e.g. job creation), or a StaffDepartment for a Staff Portal action.
export type EventJobActivityEntry = {
  id: string;
  at: string;
  actor: string;
  department: string;
  action: string;
  details?: string;
};

export type RequiredItem = {
  itemName: string;
  quantity: number;
};

// Snapshotted onto the job at sync time (and refreshed on every admin visit to
// /event-jobs) purely because Staff Portal accounts are mocked and cannot read the
// real `bookings` table under current RLS — see SUPABASE_CONNECTION_PENDING.md. Once
// real Supabase staff auth exists, department pages should join this live instead.
export type EventSummarySnapshot = {
  customerName?: string | null;
  customerPhone?: string | null;
  eventName: string;
  eventDate: string;
  eventTime: string | null;
  venue: string | null;
};

// Same snapshot-for-the-same-reason as EventSummarySnapshot above — Booking Final
// Check (Step 13) needs to show payment facts on a Staff Portal page that cannot
// legally read `bookings`/`booking_payments` under current RLS.
export type PaymentSummarySnapshot = {
  totalAmount: number;
  amountReceived: number;
  pendingBalance: number;
  depositAmount: number;
  paymentStatus: string;
};

export type WarehouseItemPrep = {
  itemName: string;
  requiredQuantity: number;
  preparedQuantity: number | null;
  unavailable: boolean;
  damaged: boolean;
  otherIssue: string;
  remarks: string;
};

export type WarehousePreparation = {
  items: WarehouseItemPrep[];
  completedAt: string | null;
  completedBy: string | null;
};

export type QcIssueType = 'none' | 'stain' | 'tear' | 'missing_part' | 'other';

export type QcItemCheck = {
  itemName: string;
  checkedQuantity: number | null;
  goodQuantity: number | null;
  issueType: QcIssueType;
  remarks: string;
  // Real photo upload needs Supabase Storage (deferred) — this is a text placeholder
  // for now (a note or a link), not an actual file. See SUPABASE_CONNECTION_PENDING.md.
  evidenceNote: string;
};

export type QualityCheck = {
  items: QcItemCheck[];
  proofPhotoPaths?: string[];
  completedAt: string | null;
  completedBy: string | null;
};

export type PackingChecklist = {
  correctQuantityPacked: boolean;
  correctBoxes: boolean;
  properLabels: boolean;
  accessoriesIncluded: boolean;
  itemsSecured: boolean;
  correctEventIdentification: boolean;
  remarks: string;
  proofPhotoPaths: string[];
  completedAt: string | null;
  completedBy: string | null;
};

// ---- Step 13: Booking Final Check + Close Event --------------------------------

export type BookingFinalCheck = {
  paymentComplete: boolean;
  depositSettled: boolean;
  damageLossAcknowledged: boolean;
  refundAmount: number;
  additionalPaymentAmount: number;
  notes: string;
  completedAt: string;
  completedBy: string;
};

export type StylistInterestStatus = 'interested' | 'approved' | 'rejected' | 'backup';

export type StylistInterest = {
  id: string;
  stylistAccountId: string;
  stylistName: string;
  status: StylistInterestStatus;
  expressedAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
};

// ---- Step 8: Travel Manager (admin/franchise-admin only) -----------------------

export type TravelMode = 'train' | 'flight' | 'bus' | 'cab';

export type StylistTravelLeg = {
  id: string;
  isReturnLeg: boolean;
  mode: TravelMode;
  from: string;
  to: string;
  departureAt: string;
  arrivalAt: string;
  ticketReference: string;
  // Real ticket file upload needs Supabase Storage (deferred) — text placeholder for
  // now (a note or a link). See SUPABASE_CONNECTION_PENDING.md.
  ticketFileNote: string;
  pickupDetails: string;
};

export type StylistAccommodation = {
  hotelName: string;
  checkIn: string;
  checkOut: string;
  roomDetails: string;
};

// One plan per APPROVED stylist interest (interestId links back to StylistInterest.id
// on the same job) — travel is only ever entered for a stylist the admin has approved.
export type StylistTravelPlan = {
  interestId: string;
  stylistAccountId: string;
  stylistName: string;
  travelLegs: StylistTravelLeg[];
  accommodation: StylistAccommodation | null;
  ticketConfirmedAt?: string | null;
  ticketConfirmedBy?: string | null;
  // Storage path (in the private 'stylist-tickets' bucket) and original file
  // name for the ticket document an admin uploaded. Null until an admin
  // actually uploads a file -- ticketConfirmedAt alone can also be set by the
  // older "confirmed & sent on WhatsApp" flow with no file attached.
  ticketFilePath?: string | null;
  ticketFileName?: string | null;
  updatedAt: string;
  updatedBy: string;
};

// ---- Step 9: Event day / stylist execution -------------------------------------

export type StylistExecutionStatus = 'not_started' | 'reached_venue' | 'work_started' | 'work_completed';

export type StylistExecutionEntry = {
  interestId: string;
  stylistAccountId: string;
  stylistName: string;
  status: StylistExecutionStatus;
  reachedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  remarks: string;
};

// ---- Step 10: Collection (post-event check-in) ---------------------------------

export type CollectionItemCheck = {
  itemName: string;
  sentQuantity: number;
  returnedQuantity: number | null;
  visibleDamage: boolean;
  wrongProduct: boolean;
  clientHoldingItem: boolean;
  shortQuantity: boolean;
  remarks: string;
  // Text placeholder — see evidenceNote note under QcItemCheck above.
  evidenceNote: string;
};

export type CollectionCheck = {
  items: CollectionItemCheck[];
  collectedFrom?: string;
  handedOverTo?: string;
  handoverNotes?: string;
  handoverConfirmedAt?: string | null;
  completedAt: string | null;
  completedBy: string | null;
};

// ---- Step 11: Return QC (same QC work area, kept separate from pre-event QC) ---

export type ReturnQcItemCheck = {
  itemName: string;
  returnedQuantity: number;
  goodQuantity: number | null;
  damagedQuantity: number | null;
  repairRequired: boolean;
  unusable: boolean;
  remarks: string;
  evidenceNote: string;
};

export type ReturnQualityCheck = {
  items: ReturnQcItemCheck[];
  proofPhotoPaths?: string[];
  completedAt: string | null;
  completedBy: string | null;
};

// ---- Step 12: Return Warehouse + inventory disposition -------------------------

export type ReturnWarehouseItemResult = {
  itemName: string;
  usableQuantity: number;
  damagedRepairQuantity: number;
  missingLostQuantity: number;
  storageLocation?: string;
  remarks: string;
};

export type ReturnWarehouseCheck = {
  items: ReturnWarehouseItemResult[];
  receivedFrom?: string;
  receivingNotes?: string;
  receivedConfirmedAt?: string | null;
  completedAt: string | null;
  completedBy: string | null;
};

// TEMPORARY MOCK MODEL — see SUPABASE_CONNECTION_PENDING.md ("Central Event Job +
// stage records"). Deliberately does NOT duplicate booking-level financial facts —
// only what department screens genuinely need and cannot otherwise reach (see
// EventSummarySnapshot / RequiredItem above for why).
export type EventJob = {
  id: string;
  bookingId: number;
  bookingNumber: string;
  bookingType: 'sale' | 'rental';
  eventSummary: EventSummarySnapshot;
  requiredItems: RequiredItem[];
  stylistsRequired: boolean;
  stylistsRequiredCount: number;
  status: 'active' | 'closed';
  stages: EventJobStage[];
  warehousePrep: WarehousePreparation | null;
  qualityCheck: QualityCheck | null;
  packingChecklist: PackingChecklist | null;
  stylistInterests: StylistInterest[];
  travelPlans: StylistTravelPlan[];
  stylistExecutions: StylistExecutionEntry[];
  collectionCheck: CollectionCheck | null;
  returnQualityCheck: ReturnQualityCheck | null;
  returnWarehouseCheck: ReturnWarehouseCheck | null;
  paymentSummary: PaymentSummarySnapshot | null;
  bookingFinalCheck: BookingFinalCheck | null;
  // Guards Step 17's performance-credit awarding against ever double-counting the same
  // job, independent of (in addition to) the `status !== 'active'` duplicate-closure
  // guard in closeEventJob().
  performanceCredited: boolean;
  issues: EventJobIssue[];
  activity: EventJobActivityEntry[];
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
};

export type ConfirmedBookingSummary = {
  bookingId: number;
  bookingNumber: string;
  bookingCreatedAt: string;
  bookingType: string;
  customerName?: string | null;
  customerPhone?: string | null;
  status: string;
  eventName: string;
  eventDate: string;
  eventTime: string | null;
  eventLocation: string | null;
  items: RequiredItem[];
  payment: PaymentSummarySnapshot;
};
