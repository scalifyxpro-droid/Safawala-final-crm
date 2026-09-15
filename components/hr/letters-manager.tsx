'use client';

import { useState, useTransition } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { saveLetterAction } from '@/app/hr/actions';
import jsPDF from 'jspdf';
import {
  BORDER_SOFT,
  BRAND_DARK,
  BRAND_MID,
  MUTED,
  ROW_TINT,
  loadBrandLogo,
  loadBrandSignature,
  randomOwnerPassword,
  sectionBox,
  stampFooterOnAllPages,
} from '@/lib/pdf/brand';

type Staff = {
  id: number;
  name: string;
  phone?: string | null;
  email?: string | null;
};
type Letter = {
  id: number;
  staff_id: number;
  letter_type: string;
  title: string;
  issued_on: string;
  notes?: string | null;
  staff_members?: { name?: string; phone?: string; email?: string } | null;
};
type OfferDetails = {
  designation: string;
  department: string;
  joiningDate: string;
  salary: string;
  probation: string;
  posting: string;
  workingHours: string;
  conditions: string;
  notes: string;
};
const types = [
  'Offer letter',
  'Appointment letter',
  'Joining letter',
  'Internship letter',
  'Experience certificate',
  'Relieving letter',
  'Salary increment letter',
  'NOC',
  'Warning letter',
  'Termination letter',
];

export function LettersManager({
  initialRecords,
  staff,
}: {
  initialRecords: Letter[];
  staff: Staff[];
}) {
  const [rows] = useState(initialRecords);
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<Letter | null>(null);
  const [pending, start] = useTransition();
  function save(form: HTMLFormElement) {
    const d = new FormData(form);
    start(async () => {
      const letterType = String(d.get('letter_type') || 'Offer letter');
      const title = String(d.get('title') || letterType);
      const details: OfferDetails = {
        designation: String(d.get('designation') || 'Staff Member'),
        department: String(d.get('department') || 'Safawala.com'),
        joiningDate: String(
          d.get('joining_date') || 'To be mutually confirmed',
        ),
        salary: String(d.get('salary') || 'To be discussed'),
        probation: String(d.get('probation') || '3 (Three) months'),
        posting: String(d.get('posting') || 'Head Office / As assigned'),
        workingHours: String(
          d.get('working_hours') || '10:00 AM to 7:00 PM, Monday to Saturday',
        ),
        conditions: String(
          d.get('conditions') ||
            'This offer is contingent upon satisfactory verification of all original documents submitted by you.\nYou will be required to serve the stated probation period.',
        ),
        notes: String(d.get('notes') || ''),
      };
      const result = await saveLetterAction({
        staff_id: Number(d.get('staff_id')),
        letter_type: letterType,
        title,
        issued_on: String(d.get('issued_on')),
        notes: JSON.stringify(details),
      });
      if (!result.error) window.location.reload();
    });
  }
  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="flex items-center justify-between p-5">
          <div>
            <p className="font-semibold">Generate an HR letter</p>
            <p className="text-sm text-muted-foreground">
              Use staff information already stored in Staff Directory.
            </p>
          </div>
          <Button onClick={() => setOpen(true)}>New letter</Button>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-[#faf8f4] dark:bg-[#241e17] text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-5 py-3">Employee</th>
                <th className="px-5 py-3">Letter type</th>
                <th className="px-5 py-3">Title</th>
                <th className="px-5 py-3">Issued</th>
                <th className="px-5 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="px-5 py-4 font-medium">
                    {row.staff_members?.name ?? 'Employee'}
                  </td>
                  <td className="px-5 py-4">{row.letter_type}</td>
                  <td className="px-5 py-4">{row.title || row.letter_type}</td>
                  <td className="px-5 py-4">{row.issued_on}</td>
                  <td className="px-5 py-4 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPreview(row)}
                    >
                      Preview / PDF
                    </Button>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-12 text-center text-muted-foreground"
                  >
                    No letters generated yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/40 p-4">
          <Card className="w-full max-w-lg">
            <CardContent className="p-6">
              <h2 className="mb-4 text-lg font-semibold">Generate HR letter</h2>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  save(event.currentTarget);
                }}
                className="space-y-3"
              >
                <label className="block text-sm">
                  Employee
                  <select
                    name="staff_id"
                    required
                    className="mt-1 h-10 w-full rounded border bg-white dark:bg-card px-2"
                  >
                    {staff.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  Letter type
                  <select
                    name="letter_type"
                    className="mt-1 h-10 w-full rounded border bg-white dark:bg-card px-2"
                  >
                    {types.map((type) => (
                      <option key={type}>{type}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  Subject / title
                  <input
                    name="title"
                    placeholder="Offer of employment"
                    className="mt-1 h-10 w-full rounded border bg-white dark:bg-card px-2"
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm">
                    Designation
                    <input
                      name="designation"
                      required
                      defaultValue="Staff Member"
                      className="mt-1 h-10 w-full rounded border bg-white dark:bg-card px-2"
                    />
                  </label>
                  <label className="block text-sm">
                    Department
                    <input
                      name="department"
                      required
                      placeholder="e.g. Warehouse"
                      className="mt-1 h-10 w-full rounded border bg-white dark:bg-card px-2"
                    />
                  </label>
                  <label className="block text-sm">
                    Date of joining
                    <input
                      name="joining_date"
                      type="date"
                      required
                      className="mt-1 h-10 w-full rounded border bg-white dark:bg-card px-2"
                    />
                  </label>
                  <label className="block text-sm">
                    Gross monthly salary
                    <input
                      name="salary"
                      required
                      placeholder="₹ 25,000 per month (CTC)"
                      className="mt-1 h-10 w-full rounded border bg-white dark:bg-card px-2"
                    />
                  </label>
                  <label className="block text-sm">
                    Probation period
                    <input
                      name="probation"
                      required
                      defaultValue="3 (Three) months"
                      className="mt-1 h-10 w-full rounded border bg-white dark:bg-card px-2"
                    />
                  </label>
                  <label className="block text-sm">
                    Place of posting
                    <input
                      name="posting"
                      required
                      defaultValue="Head Office / As assigned"
                      className="mt-1 h-10 w-full rounded border bg-white dark:bg-card px-2"
                    />
                  </label>
                </div>
                <label className="block text-sm">
                  Working hours
                  <input
                    name="working_hours"
                    required
                    defaultValue="10:00 AM to 7:00 PM, Monday to Saturday"
                    className="mt-1 h-10 w-full rounded border bg-white dark:bg-card px-2"
                  />
                </label>
                <label className="block text-sm">
                  Conditions of offer
                  <textarea
                    name="conditions"
                    required
                    rows={3}
                    defaultValue={
                      'This offer is contingent upon satisfactory verification of all original documents submitted by you.\nYou will be required to serve the stated probation period.'
                    }
                    className="mt-1 w-full rounded border bg-white dark:bg-card px-2 py-2"
                  />
                </label>
                <label className="block text-sm">
                  Issue date
                  <input
                    name="issued_on"
                    type="date"
                    required
                    defaultValue={new Date().toISOString().slice(0, 10)}
                    className="mt-1 h-10 w-full rounded border bg-white dark:bg-card px-2"
                  />
                </label>
                <label className="block text-sm">
                  Additional notes
                  <textarea
                    name="notes"
                    rows={3}
                    placeholder="Optional terms or instructions"
                    className="mt-1 w-full rounded border bg-white dark:bg-card px-2 py-2"
                  />
                </label>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={pending}>
                    {pending ? 'Saving…' : 'Save letter'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      ) : null}
      {preview ? (
        <LetterPreview letter={preview} onClose={() => setPreview(null)} />
      ) : null}
    </div>
  );
}

function LetterPreview({
  letter,
  onClose,
}: {
  letter: Letter;
  onClose: () => void;
}) {
  const name = letter.staff_members?.name || 'Candidate Name';
  const isOffer = letter.letter_type.toLowerCase().includes('offer');
  const details = parseOfferDetails(letter.notes, name);
  const terms = [
    ['POSITION / DESIGNATION', details.designation],
    ['DEPARTMENT', details.department],
    ['DATE OF JOINING', details.joiningDate],
    ['GROSS MONTHLY SALARY', details.salary],
    ['PROBATION PERIOD', details.probation],
    ['PLACE OF POSTING', details.posting],
    ['WORKING HOURS', details.workingHours],
  ];
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#211d18]/70 p-4 sm:p-8 print:static print:bg-white print:p-0">
      <div className="mx-auto max-w-[820px]">
        <article className="print:shadow-none mx-auto min-h-[1056px] border-t-[6px] border-[#5b63f6] bg-white dark:bg-card px-8 py-9 text-[#12345b] shadow-2xl sm:px-12 sm:py-11">
          <header className="flex items-start justify-between gap-8 border-b-4 border-[#5b63f6] pb-5">
            <div>
              <Image
                src="/safawala-wordmark-transparent.png"
                alt="Safawala.com"
                width={260}
                height={48}
                className="h-12 w-auto object-contain"
              />
              <p className="mt-2 text-[11px]">
                Fashion Rental &amp; Styling • Wedding Turbans &amp; Accessories
              </p>
              <p className="text-[11px]">info@safawala.com • +91 98765 43210</p>
              <p className="text-[11px]">
                www.safawala.com • Mumbai, Maharashtra, India
              </p>
            </div>
            <dl className="text-right text-xs leading-6">
              <div>
                <dt className="font-semibold">Date:</dt>
                <dd>{formatDate(letter.issued_on)}</dd>
              </div>
              <div>
                <dt className="font-semibold">Ref No.:</dt>
                <dd>VADODARA-BRANCH-{String(letter.id).padStart(6, '0')}</dd>
              </div>
              <div>
                <dt className="font-semibold">Issuing Authority:</dt>
                <dd>Human Resources</dd>
              </div>
            </dl>
          </header>
          <div className="mt-7 border-y border-[#d8e0eb] py-6 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-[#8a9bb5]">
              Human Resources Department
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-[0.22em] text-[#5b63f6]">
              {letter.letter_type.toUpperCase()}
            </h1>
          </div>
          <main className="space-y-5 pt-6 text-sm leading-7">
            <div className="rounded border border-[#d8e0eb] bg-[#f8fafc] dark:bg-[#241e17] px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#6d7f99]">
                Subject
              </p>
              <p className="mt-1 font-semibold text-[#12345b]">
                {letter.title || 'Offer of Employment'}
              </p>
            </div>
            <p>
              Dear <strong>{name}</strong>,
            </p>
            <p>
              {isOffer ? (
                <>
                  We are delighted to inform you that, after evaluating your
                  profile and interview performance,{' '}
                  <strong>Safawala.com</strong> is pleased to extend this formal
                  offer of employment to you. We believe your skills and
                  experience will be a valuable addition to our team.
                </>
              ) : (
                <LetterOpening type={letter.letter_type} name={name} />
              )}
            </p>
            <p>
              {isOffer ? (
                <>
                  You are being offered the position of{' '}
                  <strong>{details.designation}</strong> in the{' '}
                  {details.department} department, subject to the terms and
                  conditions outlined below.
                </>
              ) : (
                <LetterBody type={letter.letter_type} name={name} />
              )}
            </p>
            {isOffer ? (
              <>
                <h2 className="pt-2 text-xs font-bold tracking-[0.16em] text-[#8a9bb5]">
                  EMPLOYMENT TERMS
                </h2>
                <table className="w-full border-collapse text-sm">
                  <tbody>
                    {terms.map(([label, value]) => (
                      <tr key={label} className="border border-[#d8e0eb]">
                        <th className="w-2/5 bg-[#f5f8fc] dark:bg-[#241e17] px-3 py-2 text-left text-xs font-semibold tracking-wide">
                          {label}
                        </th>
                        <td className="px-3 py-2 font-medium">{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <h2 className="pt-2 text-xs font-bold tracking-[0.16em] text-[#8a9bb5]">
                  CONDITIONS OF OFFER
                </h2>
                <ol className="list-decimal space-y-1 pl-5">
                  {details.conditions
                    .split('\n')
                    .filter(Boolean)
                    .map((condition) => (
                      <li key={condition}>{condition}</li>
                    ))}
                </ol>
              </>
            ) : null}
            {details.notes ? (
              <p className="border-l-2 border-[#5b63f6] pl-4 italic">
                {details.notes}
              </p>
            ) : null}
            <p className="pt-4">
              Regards,
              <br />
              <strong>Admin / Human Resources</strong>
            </p>
            <p className="text-xs text-[#6d7f99]">
              This document was generated from the Safawala CRM Staff Directory
              on {formatDate(letter.issued_on)}.
            </p>
          </main>
        </article>
        <div className="flex justify-end gap-2 py-4 print:hidden">
          <Button variant="outline" onClick={() => window.print()}>
            Print
          </Button>
          <Button
            onClick={() => {
              void downloadLetterPdf(letter, details, name);
            }}
          >
            Download PDF
          </Button>
          <Button onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}

function LetterOpening({ type, name }: { type: string; name: string }) {
  const normalized = type.toLowerCase();
  if (normalized.includes('experience'))
    return (
      <>
        This is to certify that <strong>{name}</strong> has been associated with{' '}
        <strong>Safawala.com</strong>. This certificate is issued upon request
        for official use.
      </>
    );
  if (normalized.includes('relieving'))
    return (
      <>
        This letter confirms that <strong>{name}</strong> has been relieved from
        their responsibilities with <strong>Safawala.com</strong>, subject to
        completion of the required handover.
      </>
    );
  if (normalized.includes('internship'))
    return (
      <>
        We are pleased to offer <strong>{name}</strong> an internship
        opportunity with <strong>Safawala.com</strong> to gain practical
        experience and professional exposure.
      </>
    );
  if (normalized.includes('joining'))
    return (
      <>
        We are pleased to acknowledge the joining of <strong>{name}</strong> at{' '}
        <strong>Safawala.com</strong>. We welcome you to the team and look
        forward to your contribution.
      </>
    );
  if (normalized.includes('appointment'))
    return (
      <>
        We are pleased to confirm the appointment of <strong>{name}</strong>{' '}
        with <strong>Safawala.com</strong> under the terms set out below.
      </>
    );
  if (normalized.includes('increment'))
    return (
      <>
        We are pleased to inform <strong>{name}</strong> of a revision to their
        compensation in recognition of their contribution to{' '}
        <strong>Safawala.com</strong>.
      </>
    );
  if (normalized.includes('noc'))
    return (
      <>
        <strong>Safawala.com</strong> has no objection to{' '}
        <strong>{name}</strong> for the purpose stated in this letter, subject
        to company policy.
      </>
    );
  if (normalized.includes('warning'))
    return (
      <>
        This letter serves as a formal warning to <strong>{name}</strong>{' '}
        regarding the matter documented by Human Resources.
      </>
    );
  if (normalized.includes('termination'))
    return (
      <>
        This letter confirms the termination of <strong>{name}</strong>&rsquo;s
        employment with <strong>Safawala.com</strong>, effective as communicated
        by Human Resources.
      </>
    );
  return (
    <>
      This letter has been issued by the Human Resources department based on the
      employee record maintained in the HR system.
    </>
  );
}

function LetterBody({ type, name }: { type: string; name: string }) {
  const normalized = type.toLowerCase();
  if (normalized.includes('experience'))
    return (
      <>
        During their association, <strong>{name}</strong> carried out assigned
        responsibilities professionally. We wish them success in their future
        endeavours.
      </>
    );
  if (normalized.includes('relieving'))
    return (
      <>
        All company assets and responsibilities must be handed over to the
        designated manager. We thank you for your service.
      </>
    );
  if (normalized.includes('internship'))
    return (
      <>
        The internship is subject to company policies, confidentiality
        requirements, and satisfactory performance.
      </>
    );
  if (normalized.includes('joining') || normalized.includes('appointment'))
    return (
      <>
        Please report to the assigned department on the joining date and comply
        with all Safawala.com policies and procedures.
      </>
    );
  if (normalized.includes('increment'))
    return (
      <>
        The revised compensation will be administered through payroll from the
        effective date recorded by Human Resources.
      </>
    );
  if (normalized.includes('noc'))
    return (
      <>
        This no-objection confirmation does not alter the terms of employment or
        relieve the employee of existing obligations.
      </>
    );
  if (normalized.includes('warning'))
    return (
      <>
        You are expected to take immediate corrective action and maintain the
        standards required by your role. Further occurrences may lead to
        disciplinary action.
      </>
    );
  if (normalized.includes('termination'))
    return (
      <>
        Please complete the handover and clearance process with Human Resources.
        Any final settlement will be processed according to company policy.
      </>
    );
  return (
    <>
      Please retain this document for your official records. Any terms specified
      by HR form part of this letter.
    </>
  );
}

function letterOpeningPlainText(type: string, name: string): string {
  const normalized = type.toLowerCase();
  if (normalized.includes('experience'))
    return `This is to certify that ${name} has been associated with Safawala.com. This certificate is issued upon request for official use.`;
  if (normalized.includes('relieving'))
    return `This letter confirms that ${name} has been relieved from their responsibilities with Safawala.com, subject to completion of the required handover.`;
  if (normalized.includes('internship'))
    return `We are pleased to offer ${name} an internship opportunity with Safawala.com to gain practical experience and professional exposure.`;
  if (normalized.includes('joining'))
    return `We are pleased to acknowledge the joining of ${name} at Safawala.com. We welcome you to the team and look forward to your contribution.`;
  if (normalized.includes('appointment'))
    return `We are pleased to confirm the appointment of ${name} with Safawala.com under the terms set out below.`;
  if (normalized.includes('increment'))
    return `We are pleased to inform ${name} of a revision to their compensation in recognition of their contribution to Safawala.com.`;
  if (normalized.includes('noc'))
    return `Safawala.com has no objection to ${name} for the purpose stated in this letter, subject to company policy.`;
  if (normalized.includes('warning'))
    return `This letter serves as a formal warning to ${name} regarding the matter documented by Human Resources.`;
  if (normalized.includes('termination'))
    return `This letter confirms the termination of ${name}'s employment with Safawala.com, effective as communicated by Human Resources.`;
  return `This letter has been issued by the Human Resources department based on the employee record maintained in the HR system.`;
}

function letterBodyPlainText(type: string, name: string): string {
  const normalized = type.toLowerCase();
  if (normalized.includes('experience'))
    return `During their association, ${name} carried out assigned responsibilities professionally. We wish them success in their future endeavours.`;
  if (normalized.includes('relieving'))
    return `All company assets and responsibilities must be handed over to the designated manager. We thank you for your service.`;
  if (normalized.includes('internship'))
    return `The internship is subject to company policies, confidentiality requirements, and satisfactory performance.`;
  if (normalized.includes('joining') || normalized.includes('appointment'))
    return `Please report to the assigned department on the joining date and comply with all Safawala.com policies and procedures.`;
  if (normalized.includes('increment'))
    return `The revised compensation will be administered through payroll from the effective date recorded by Human Resources.`;
  if (normalized.includes('noc'))
    return `This no-objection confirmation does not alter the terms of employment or relieve the employee of existing obligations.`;
  if (normalized.includes('warning'))
    return `You are expected to take immediate corrective action and maintain the standards required by your role. Further occurrences may lead to disciplinary action.`;
  if (normalized.includes('termination'))
    return `Please complete the handover and clearance process with Human Resources. Any final settlement will be processed according to company policy.`;
  return `Please retain this document for your official records. Any terms specified by HR form part of this letter.`;
}

// ---- Branded PDF export: matches the sale/rental invoice's look (crown
// logo header, bordered boxes, signature block, numbered conditions and the
// same footer treatment) instead of the previous blue letterhead style. ----
async function downloadLetterPdf(
  letter: Letter,
  details: OfferDetails,
  name: string,
) {
  const [logo, signature] = await Promise.all([loadBrandLogo(), loadBrandSignature()]);
  const doc = new jsPDF({
    unit: 'mm',
    format: 'a4',
    encryption: { userPassword: '', ownerPassword: randomOwnerPassword(), userPermissions: ['print', 'copy'] },
  });
  const pageWidth = doc.internal.pageSize.getWidth();
  const left = 16;
  const right = pageWidth - 16;
  const boxWidth = right - left;
  const isOfferType = letter.letter_type.toLowerCase().includes('offer');
  const refNumber = `VADODARA-BRANCH-${String(letter.id).padStart(6, '0')}`;

  const ensureSpace = (height: number, cursor: number) => {
    if (cursor + height > 266) {
      doc.addPage();
      return 20;
    }
    return cursor;
  };

  // ---- Header banner ----
  const headerTop = 10;
  const headerHeight = 34;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...BORDER_SOFT);
  doc.setLineWidth(0.45);
  doc.roundedRect(left - 6, headerTop, boxWidth + 12, headerHeight, 3, 3, 'FD');
  if (logo) {
    const logoH = 13;
    doc.addImage(logo.dataUrl, 'PNG', left, headerTop + 5, logoH * logo.ratio, logoH);
  } else {
    doc.setTextColor(...BRAND_DARK);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('SAFAWALA', left, headerTop + 14);
  }
  doc.setTextColor(...MUTED);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Premium Wedding Accessories', left, headerTop + headerHeight - 4);
  doc.setTextColor(...BRAND_DARK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(refNumber, right, headerTop + 10, { align: 'right' });
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.text(letter.letter_type.toUpperCase(), right, headerTop + 17, { align: 'right' });
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text(`Date: ${formatDate(letter.issued_on)}`, right, headerTop + 23, { align: 'right' });
  doc.text('Issued by: Human Resources', right, headerTop + 29, { align: 'right' });

  let y = headerTop + headerHeight + 8;

  // ---- Subject box ----
  sectionBox(doc, left, y, boxWidth, 16);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text('SUBJECT', left + 5, y + 6);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...BRAND_DARK);
  doc.text(letter.title || letter.letter_type, left + 5, y + 12.5);
  y += 24;

  // ---- Department / title band ----
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text('HUMAN RESOURCES DEPARTMENT', pageWidth / 2, y, { align: 'center' });
  y += 6.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...BRAND_DARK);
  doc.text(letter.letter_type.toUpperCase(), pageWidth / 2, y, { align: 'center' });
  y += 3.5;
  doc.setDrawColor(...BORDER_SOFT);
  doc.setLineWidth(0.3);
  doc.line(left, y, right, y);
  y += 8;

  // ---- Body ----
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...BRAND_DARK);
  doc.text(`Dear ${name},`, left, y);
  y += 7;

  const paragraph1 = isOfferType
    ? 'We are delighted to inform you that, after evaluating your profile and interview performance, Safawala.com is pleased to extend this formal offer of employment to you. We believe your skills and experience will be a valuable addition to our team.'
    : letterOpeningPlainText(letter.letter_type, name);
  const paragraph2 = isOfferType
    ? `You are being offered the position of ${details.designation} in the ${details.department} department, subject to the terms and conditions outlined below.`
    : letterBodyPlainText(letter.letter_type, name);

  for (const paragraph of [paragraph1, paragraph2]) {
    const lines = doc.splitTextToSize(paragraph, boxWidth) as string[];
    y = ensureSpace(lines.length * 4.6 + 4, y);
    doc.text(lines, left, y);
    y += lines.length * 4.6 + 5;
  }

  if (isOfferType) {
    y = ensureSpace(9, y);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...BRAND_MID);
    doc.text('EMPLOYMENT TERMS', left, y);
    y += 5;

    const labelWidth = boxWidth * 0.38;
    const valueWidth = boxWidth - labelWidth - 6;
    const terms: [string, string][] = [
      ['POSITION / DESIGNATION', details.designation],
      ['DEPARTMENT', details.department],
      ['DATE OF JOINING', details.joiningDate],
      ['GROSS MONTHLY SALARY', details.salary],
      ['PROBATION PERIOD', details.probation],
      ['PLACE OF POSTING', details.posting],
      ['WORKING HOURS', details.workingHours],
    ];
    doc.setFontSize(8.5);
    for (const [label, value] of terms) {
      const valueLines = doc.splitTextToSize(value || '-', valueWidth) as string[];
      const labelLines = doc.splitTextToSize(label, labelWidth - 5) as string[];
      const rowHeight = Math.max(labelLines.length, valueLines.length) * 3.9 + 3;
      y = ensureSpace(rowHeight, y);
      doc.setDrawColor(...BORDER_SOFT);
      doc.setLineWidth(0.3);
      doc.setFillColor(...ROW_TINT);
      doc.rect(left, y, labelWidth, rowHeight, 'FD');
      doc.setFillColor(255, 255, 255);
      doc.rect(left + labelWidth, y, boxWidth - labelWidth, rowHeight, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...BRAND_DARK);
      doc.text(labelLines, left + 2.5, y + 4.2);
      doc.setFont('helvetica', 'normal');
      doc.text(valueLines, left + labelWidth + 2.5, y + 4.2);
      y += rowHeight;
    }
    y += 5;

    y = ensureSpace(8, y);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...BRAND_MID);
    doc.text('CONDITIONS OF OFFER', left, y);
    y += 2.5;
    doc.setDrawColor(...BORDER_SOFT);
    doc.setLineWidth(0.3);
    doc.line(left, y, right, y);
    y += 4.5;

    const conditions = details.conditions
      .replace(/\\r\\n/g, '\n')
      .replace(/\\n/g, '\n')
      .split('\n')
      .map((entry) => entry.trim())
      .filter(Boolean);
    doc.setFontSize(8.2);
    conditions.forEach((condition, index) => {
      const lines = doc.splitTextToSize(condition, boxWidth - 6.5) as string[];
      const blockHeight = lines.length * 3.7 + 1.4;
      y = ensureSpace(blockHeight, y);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...BRAND_DARK);
      doc.text(`${index + 1}.`, left, y);
      doc.setFont('helvetica', 'normal');
      doc.text(lines, left + 6.5, y);
      y += blockHeight;
    });
    y += 2;
  }

  if (details.notes) {
    const noteLines = doc.splitTextToSize(details.notes, boxWidth - 10) as string[];
    const boxHeight = noteLines.length * 4 + 6;
    y = ensureSpace(boxHeight + 5, y);
    doc.setDrawColor(...BORDER_SOFT);
    doc.setLineWidth(0.6);
    doc.line(left, y, left, y + boxHeight);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text(noteLines, left + 4, y + 4);
    y += boxHeight + 6;
  }

  // ---- Sign-off ----
  y = ensureSpace(28, y);
  y += 3;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...BRAND_DARK);
  doc.text('Regards,', left, y);
  y += 5.5;
  if (signature) {
    const signatureW = 26;
    const signatureH = signatureW / signature.ratio;
    doc.addImage(signature.dataUrl, 'PNG', left, y, signatureW, signatureH, undefined, 'FAST');
    y += signatureH + 2;
  }
  doc.setFont('helvetica', 'bold');
  doc.text('Admin / Human Resources', left, y);
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text(
    doc.splitTextToSize(
      `This document was generated from the Safawala CRM Staff Directory on ${formatDate(letter.issued_on)}.`,
      boxWidth,
    ) as string[],
    left,
    y,
  );

  stampFooterOnAllPages(doc, { left, right, note: 'Generated by Safawala Human Resources.' });
  doc.save(
    `safawala-${letter.letter_type.toLowerCase().replace(/\s+/g, '-')}-${letter.id}.pdf`,
  );
}

function parseOfferDetails(
  notes: string | null | undefined,
  staffName: string,
): OfferDetails {
  const inferredDepartment = staffName.toLowerCase().endsWith(' department')
    ? staffName.slice(0, -' department'.length)
    : 'Safawala.com';
  const fallback: OfferDetails = {
    designation: 'Staff Member',
    department: inferredDepartment,
    joiningDate: 'To be mutually confirmed',
    salary: 'As per the company compensation structure',
    probation: '3 (Three) months',
    posting: 'Head Office / As assigned',
    workingHours: '10:00 AM to 7:00 PM, Monday to Saturday',
    conditions:
      'This offer is contingent upon satisfactory verification of all original documents submitted by you.\nYou will be required to serve the stated probation period.',
    notes: '',
  };
  if (!notes) return fallback;
  try {
    const parsed = JSON.parse(notes) as Partial<OfferDetails>;
    if (parsed && typeof parsed === 'object' && 'designation' in parsed) {
      const merged = { ...fallback, ...parsed };
      return {
        ...merged,
        conditions: normalizeMultiline(merged.conditions),
        notes: normalizeMultiline(merged.notes),
      };
    }
  } catch {
    /* Older letters stored plain notes; keep the safe defaults. */
  }
  return { ...fallback, notes: normalizeMultiline(notes) };
}

function normalizeMultiline(value: string): string {
  // Some older letters were saved with a literal two-character "\\n"
  // (backslash + n) instead of a real newline, because a plain JSX string
  // attribute does not interpret escape sequences. Normalize both so every
  // letter -- old or new -- renders its conditions/notes as real line breaks.
  if (typeof value !== 'string') return value;
  return value.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n');
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
}
