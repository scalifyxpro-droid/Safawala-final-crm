'use client';
import { useMemo, useState, useTransition } from 'react';
import { Download, Eye, FileText, Pencil, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { savePayrollAction } from '@/app/hr/actions';
import {
  BORDER_SOFT,
  BRAND_DARK,
  BRAND_MID,
  MUTED,
  ROW_ALT,
  loadBrandLogo,
  loadBrandSignature,
  randomOwnerPassword,
  sectionBox,
  stampFooterOnAllPages,
} from '@/lib/pdf/brand';
type Staff = { id: number; name: string };
type Row = {
  id: number;
  staff_id: number;
  period: string;
  base_salary: number;
  allowances: number;
  deductions: number;
  advances: number;
  net_salary: number;
  status: string;
  staff_members?: { name?: string } | null;
};
const statuses = ['pending', 'processed', 'paid'];
const inr = (value: number) => `Rs. ${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const safePeriod = (period: unknown) => {
  const value = typeof period === 'string' ? period.slice(0, 7) : '';
  return /^\d{4}-\d{2}$/.test(value) ? value : new Date().toISOString().slice(0, 7);
};
const periodLabel = (period: unknown) =>
  new Date(`${safePeriod(period)}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
const normalizePayrollRow = (row: Row): Row => ({
  ...row,
  id: Number(row?.id || 0),
  staff_id: Number(row?.staff_id || 0),
  period: `${safePeriod(row?.period)}-01`,
  base_salary: Number(row?.base_salary || 0),
  allowances: Number(row?.allowances || 0),
  deductions: Number(row?.deductions || 0),
  advances: Number(row?.advances || 0),
  net_salary: Number(row?.net_salary || 0),
  status: typeof row?.status === 'string' && row.status ? row.status : 'pending',
  staff_members: row?.staff_members && typeof row.staff_members === 'object'
    ? { name: typeof row.staff_members.name === 'string' ? row.staff_members.name : 'Employee' }
    : null,
});

async function drawBrandHeader(
  doc: import('jspdf').jsPDF,
  opts: { left: number; right: number; docNumber: string; docLabel: string; dateLabel: string },
) {
  const logo = await loadBrandLogo();
  const headerTop = 10;
  const headerHeight = 30;
  const boxWidth = opts.right - opts.left;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...BORDER_SOFT);
  doc.setLineWidth(0.45);
  doc.roundedRect(opts.left - 6, headerTop, boxWidth + 12, headerHeight, 3, 3, 'FD');
  if (logo) {
    const logoH = 12;
    doc.addImage(logo.dataUrl, 'PNG', opts.left, headerTop + 5, logoH * logo.ratio, logoH);
  } else {
    doc.setTextColor(...BRAND_DARK);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('SAFAWALA', opts.left, headerTop + 13);
  }
  doc.setTextColor(...MUTED);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('Premium Wedding Accessories', opts.left, headerTop + headerHeight - 4);
  doc.setTextColor(...BRAND_DARK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(opts.docNumber, opts.right, headerTop + 10, { align: 'right' });
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.text(opts.docLabel, opts.right, headerTop + 17, { align: 'right' });
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text(opts.dateLabel, opts.right, headerTop + 23, { align: 'right' });
  return headerTop + headerHeight;
}

async function downloadPayslipPdf(row: Row) {
  const [{ jsPDF }, signature] = await Promise.all([import('jspdf'), loadBrandSignature()]);
  const doc = new jsPDF({
    unit: 'mm',
    format: 'a4',
    encryption: { userPassword: '', ownerPassword: randomOwnerPassword(), userPermissions: ['print', 'copy'] },
  });
  const width = doc.internal.pageSize.getWidth();
  const left = 16;
  const right = width - 16;
  const boxWidth = right - left;
  const employeeName = row.staff_members?.name ?? 'Employee';

  let y = (await drawBrandHeader(doc, {
    left,
    right,
    docNumber: `PAYSLIP-${row.id}`,
    docLabel: 'SALARY SLIP',
    dateLabel: periodLabel(row.period),
  })) + 8;

  // ---- Employee / period box ----
  const boxH = 22;
  sectionBox(doc, left, y, boxWidth, boxH);
  const columnGap = 6;
  const columnWidth = (boxWidth - columnGap) / 2;
  const rightColX = left + columnWidth + columnGap;
  doc.setDrawColor(190, 190, 190);
  doc.setLineWidth(0.25);
  doc.line(left + columnWidth + columnGap / 2, y + 5, left + columnWidth + columnGap / 2, y + boxH - 5);
  let by = y + 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...BRAND_DARK);
  doc.text('EMPLOYEE', left + 5, by);
  doc.text('PAY PERIOD', rightColX + 2, by);
  by += 5.5;
  doc.setFontSize(9.5);
  doc.text(employeeName, left + 5, by);
  doc.text(periodLabel(row.period), rightColX + 2, by);
  by += 4.6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(`Staff ID: ${row.staff_id}`, left + 5, by);
  doc.text(`Status: ${row.status}`, rightColX + 2, by);
  y += boxH + 8;

  // ---- Earnings / deductions summary ----
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...BRAND_MID);
  doc.text('SALARY BREAKDOWN', left, y);
  y += 2.5;
  doc.setDrawColor(...BORDER_SOFT);
  doc.setLineWidth(0.3);
  doc.line(left, y, right, y);
  y += 7;
  const summary: [string, number, boolean?][] = [
    ['Base salary', row.base_salary],
    ['Allowances', row.allowances],
    ['Deductions', -row.deductions],
    ['Advances adjusted', -row.advances],
    ['Net salary', row.net_salary, true],
  ];
  for (const [label, value, strong] of summary) {
    doc.setFont('helvetica', strong ? 'bold' : 'normal');
    doc.setFontSize(strong ? 10.5 : 9.5);
    doc.setTextColor(...(strong ? BRAND_DARK : MUTED));
    doc.text(label, left + 5, y);
    doc.setTextColor(...BRAND_DARK);
    doc.text(inr(value), right - 5, y, { align: 'right' });
    y += strong ? 7 : 6;
    if (strong) {
      doc.setDrawColor(...BORDER_SOFT);
      doc.setLineWidth(0.3);
      doc.line(left, y - 5, right, y - 5);
    }
  }
  y += 10;

  // ---- Sign-off ----
  if (signature) {
    const signatureW = 30;
    const signatureH = signatureW / signature.ratio;
    doc.addImage(signature.dataUrl, 'PNG', right - signatureW - 5, y, signatureW, signatureH, undefined, 'FAST');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text('Authorized Signatory', right - signatureW / 2 - 5, y + signatureH + 4, { align: 'center' });
  }

  stampFooterOnAllPages(doc, { left, right, note: 'Generated by Safawala Human Resources.' });
  doc.save(`Payslip-${employeeName.replace(/\s+/g, '-')}-${safePeriod(row.period)}.pdf`);
}

async function downloadPayrollReportPdf(rows: Row[]) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({
    unit: 'mm',
    format: 'a4',
    orientation: 'landscape',
    encryption: { userPassword: '', ownerPassword: randomOwnerPassword(), userPermissions: ['print', 'copy'] },
  });
  const width = doc.internal.pageSize.getWidth();
  const left = 14;
  const right = width - 14;
  const generatedOn = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  let y = (await drawBrandHeader(doc, {
    left,
    right,
    docNumber: `${rows.length} record${rows.length === 1 ? '' : 's'}`,
    docLabel: 'PAYROLL REPORT',
    dateLabel: `Generated ${generatedOn}`,
  })) + 8;

  const columns = [
    { label: 'EMPLOYEE', x: left, w: 55 },
    { label: 'PERIOD', x: left + 55, w: 30 },
    { label: 'BASE', x: left + 85, w: 30, align: 'right' as const },
    { label: 'ALLOWANCES', x: left + 115, w: 32, align: 'right' as const },
    { label: 'DEDUCTIONS', x: left + 147, w: 32, align: 'right' as const },
    { label: 'ADVANCES', x: left + 179, w: 30, align: 'right' as const },
    { label: 'NET SALARY', x: left + 209, w: 32, align: 'right' as const },
    { label: 'STATUS', x: left + 241, w: right - (left + 241), align: 'right' as const },
  ];

  const tableHeader = () => {
    doc.setFillColor(245, 245, 245);
    doc.setDrawColor(...BORDER_SOFT);
    doc.setLineWidth(0.3);
    doc.rect(left, y, right - left, 7, 'FD');
    doc.setTextColor(...BRAND_DARK);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.6);
    columns.forEach((column) =>
      doc.text(column.label, column.align === 'right' ? column.x + column.w - 2 : column.x + 2, y + 4.8, {
        align: column.align ?? 'left',
      }),
    );
    y += 7;
  };

  tableHeader();
  let grandTotal = 0;
  rows.forEach((row, index) => {
    if (y > 180) {
      doc.addPage('a4', 'landscape');
      y = 16;
      tableHeader();
    }
    grandTotal += Number(row.net_salary || 0);
    if (index % 2 === 0) {
      doc.setFillColor(...ROW_ALT);
      doc.rect(left, y, right - left, 7, 'F');
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.6);
    doc.setTextColor(...BRAND_DARK);
    const values = [
      row.staff_members?.name ?? 'Employee',
      safePeriod(row.period),
      inr(row.base_salary),
      inr(row.allowances),
      inr(row.deductions),
      inr(row.advances),
      inr(row.net_salary),
      row.status,
    ];
    columns.forEach((column, columnIndex) => {
      const clipped = doc.splitTextToSize(values[columnIndex], column.w - 4)[0] || '-';
      doc.text(clipped, column.align === 'right' ? column.x + column.w - 2 : column.x + 2, y + 4.8, {
        align: column.align ?? 'left',
      });
    });
    y += 7;
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.15);
    doc.line(left, y, right, y);
  });

  if (!rows.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text('No payroll records match the selected filters.', left + 2, y + 8);
  } else {
    y += 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...BRAND_DARK);
    doc.text('Total payroll', left, y);
    doc.text(inr(grandTotal), right, y, { align: 'right' });
  }

  stampFooterOnAllPages(doc, { left, right, note: 'Generated by Safawala Human Resources.' });
  doc.save(`Payroll-Report-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function PayrollManager({
  initialRecords,
  staff,
}: {
  initialRecords: Row[];
  staff: Staff[];
}) {
  const [rows] = useState(() => (Array.isArray(initialRecords) ? initialRecords : []).map(normalizePayrollRow));
  const [month, setMonth] = useState('all');
  const [search, setSearch] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [status, setStatus] = useState('all');
  const [editing, setEditing] = useState<Row | null>(null);
  const [preview, setPreview] = useState<Row | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [pending, start] = useTransition();
  const [exportingReport, setExportingReport] = useState(false);
  const [exportingSlip, setExportingSlip] = useState(false);
  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (month === 'all' || safePeriod(r.period) === month) &&
          (status === 'all' || r.status === status) &&
          (r.staff_members?.name ?? '')
            .toLowerCase()
            .includes(search.toLowerCase()),
      ),
    [rows, month, status, search],
  );
  const total = filtered.reduce((n, r) => n + Number(r.net_salary || 0), 0);
  const pendingCount = filtered.filter((r) => r.status === 'pending').length;
  const paid = filtered.filter((r) => r.status === 'paid').length;
  function save(form: HTMLFormElement) {
    const d = new FormData(form);
    const payload = {
      staff_id: Number(d.get('staff_id')),
      period: String(d.get('period')),
      base_salary: Number(d.get('base_salary') || 0),
      allowances: Number(d.get('allowances') || 0),
      deductions: Number(d.get('deductions') || 0),
      advances: Number(d.get('advances') || 0),
      status: String(d.get('status')),
    };
    start(async () => {
      setErrorMessage('');
      const result = await savePayrollAction(editing?.id ? { id: editing.id, ...payload } : payload);
      if (result.error) setErrorMessage(result.error);
      else window.location.reload();
    });
  }
  function csv() {
    const lines = [
      [
        'Employee',
        'Period',
        'Base salary',
        'Allowances',
        'Deductions',
        'Advances',
        'Net salary',
        'Status',
      ],
      ...filtered.map((r) => [
        r.staff_members?.name ?? '',
        r.period,
        String(r.base_salary),
        String(r.allowances),
        String(r.deductions),
        String(r.advances),
        String(r.net_salary),
        r.status,
      ]),
    ];
    const blob = new Blob(
      [
        lines
          .map((l) => l.map((v) => `"${v.replaceAll('"', '""')}"`).join(','))
          .join('\n'),
      ],
      { type: 'text/csv' },
    );
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'payroll.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }
  async function downloadReport() {
    setExportingReport(true);
    try {
      await downloadPayrollReportPdf(filtered);
    } finally {
      setExportingReport(false);
    }
  }
  const blank: Row = {
    id: 0,
    staff_id: staff[0]?.id ?? 0,
    period: new Date().toISOString().slice(0, 7) + '-01',
    base_salary: 0,
    allowances: 0,
    deductions: 0,
    advances: 0,
    net_salary: 0,
    status: 'pending',
  };
  return (
    <div className="space-y-5">
      <div className="responsive-kpi-grid grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
        {[
          ['Payroll total', `₹${total.toLocaleString('en-IN')}`],
          ['Employees', filtered.length],
          ['Pending', pendingCount],
          ['Paid', paid],
        ].map(([label, value]) => (
          <Card key={String(label)}>
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {label}
              </p>
              <p className="mt-2 text-2xl font-semibold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <form className="flex w-full min-w-0 flex-col gap-2 xl:w-auto xl:flex-row" onSubmit={(event) => { event.preventDefault(); setSearch(searchDraft); if (window.matchMedia('(max-width: 1279px)').matches) { setMonth('all'); setStatus('all'); } }}>
          <input
            placeholder="Search employee"
            value={searchDraft}
            onChange={(e) => { setSearchDraft(e.target.value); if (window.matchMedia('(min-width: 1280px)').matches) setSearch(e.target.value); }}
            className="h-10 min-w-0 rounded-lg border bg-white px-3 text-sm dark:bg-card"
            type="search"
          />
          <Button type="submit" variant="outline" className="xl:hidden">Search</Button>
          </form>
          <input
            type="month"
            value={month === 'all' ? '' : month}
            onChange={(e) => setMonth(e.target.value || 'all')}
            className="hidden h-10 rounded-lg border bg-white px-3 text-sm dark:bg-card xl:block"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="hidden h-10 rounded-lg border bg-white px-3 text-sm dark:bg-card xl:block"
          >
            <option value="all">All statuses</option>
            {statuses.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <span className="flex-1" />
          <Button onClick={() => setEditing(blank)}>Add payroll</Button>
          <Button variant="outline" onClick={csv}>
            <Download />
            CSV
          </Button>
          <Button variant="outline" onClick={downloadReport} disabled={exportingReport}>
            {exportingReport ? <LoaderCircle className="animate-spin" /> : <FileText />}
            PDF
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-[#faf8f4] dark:bg-[#241e17] text-left text-xs uppercase tracking-wide text-muted-foreground">
                {[
                  'Employee',
                  'Period',
                  'Base',
                  'Allowances',
                  'Deductions',
                  'Advances',
                  'Net salary',
                  'Status',
                  '',
                ].map((h) => (
                  <th key={h} className="px-5 py-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="px-5 py-4 font-medium">
                    {r.staff_members?.name ?? 'Employee'}
                  </td>
                  <td className="px-5 py-4">{safePeriod(r.period)}</td>
                  <td className="px-5 py-4">
                    ₹{Number(r.base_salary).toLocaleString('en-IN')}
                  </td>
                  <td className="px-5 py-4">
                    ₹{Number(r.allowances).toLocaleString('en-IN')}
                  </td>
                  <td className="px-5 py-4">
                    ₹{Number(r.deductions).toLocaleString('en-IN')}
                  </td>
                  <td className="px-5 py-4">
                    ₹{Number(r.advances).toLocaleString('en-IN')}
                  </td>
                  <td className="px-5 py-4 font-semibold">
                    ₹{Number(r.net_salary).toLocaleString('en-IN')}
                  </td>
                  <td className="px-5 py-4 capitalize">{r.status}</td>
                  <td className="px-5 py-4 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setPreview(r)}
                      aria-label={`View payslip for ${r.staff_members?.name ?? 'employee'}`}
                      title="View payslip"
                    >
                      <Eye />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setEditing(r)}
                      aria-label={`Edit payroll for ${r.staff_members?.name ?? 'employee'}`}
                      title="Edit payroll"
                    >
                      <Pencil />
                    </Button>
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr>
                  <td
                    colSpan={9}
                    className="px-5 py-12 text-center text-muted-foreground"
                  >
                    No payroll records match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
      {editing && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4">
          <Card className="w-full max-w-lg">
            <CardContent className="p-6">
              <h2 className="mb-4 text-lg font-semibold">
                {editing.id ? 'Edit salary breakdown' : 'Add payroll'}
              </h2>
              {errorMessage ? <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p> : null}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  save(e.currentTarget);
                }}
                className="grid gap-3 sm:grid-cols-2"
              >
                <label className="text-sm">
                  Employee
                  <select
                    name="staff_id"
                    defaultValue={editing.staff_id}
                    className="mt-1 h-10 w-full rounded border bg-white dark:bg-card px-2"
                  >
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  Month
                  <input
                    name="period"
                    type="date"
                    defaultValue={editing.period}
                    className="mt-1 h-10 w-full rounded border bg-white dark:bg-card px-2"
                    required
                  />
                </label>
                {['base_salary', 'allowances', 'deductions', 'advances'].map(
                  (name) => (
                    <label key={name} className="text-sm capitalize">
                      {name.replace('_', ' ')}
                      <input
                        name={name}
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={editing[name as keyof Row] as number}
                        className="mt-1 h-10 w-full rounded border bg-white dark:bg-card px-2"
                      />
                    </label>
                  ),
                )}
                <label className="text-sm">
                  Status
                  <select
                    name="status"
                    defaultValue={editing.status}
                    className="mt-1 h-10 w-full rounded border bg-white dark:bg-card px-2"
                  >
                    {statuses.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <div className="col-span-full flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditing(null)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={pending}>
                    {pending ? 'Saving…' : 'Save'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
      {preview && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4">
          <Card className="w-full max-w-md">
            <CardContent className="space-y-3 p-6">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Payslip preview
              </p>
              <h2 className="text-xl font-semibold">
                {preview.staff_members?.name ?? 'Employee'}
              </h2>
              <p className="text-sm text-muted-foreground">
                Payroll period: {safePeriod(preview.period)}
              </p>
              <div className="border-y py-3 text-sm">
                <p>
                  Base salary{' '}
                  <span className="float-right">
                    ₹{Number(preview.base_salary).toLocaleString('en-IN')}
                  </span>
                </p>
                <p>
                  Allowances{' '}
                  <span className="float-right">
                    ₹{Number(preview.allowances).toLocaleString('en-IN')}
                  </span>
                </p>
                <p>
                  Deductions & advances{' '}
                  <span className="float-right">
                    −₹
                    {(
                      Number(preview.deductions) + Number(preview.advances)
                    ).toLocaleString('en-IN')}
                  </span>
                </p>
                <p className="mt-2 font-semibold">
                  Net salary{' '}
                  <span className="float-right">
                    ₹{Number(preview.net_salary).toLocaleString('en-IN')}
                  </span>
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  disabled={exportingSlip}
                  onClick={async () => {
                    setExportingSlip(true);
                    try {
                      await downloadPayslipPdf(preview);
                    } finally {
                      setExportingSlip(false);
                    }
                  }}
                >
                  {exportingSlip ? <LoaderCircle className="animate-spin" /> : <Download />}
                  Download PDF
                </Button>
                <Button onClick={() => setPreview(null)}>Close</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
