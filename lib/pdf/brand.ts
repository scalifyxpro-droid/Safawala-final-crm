// Shared Safawala PDF branding used by every generated document (invoices,
// quotes, slips, letters, payslips and reports) so they all read as one
// consistent document family: bordered header banner with the crown logo,
// boxed sections, a signatory line, and the same footer treatment.
import type { jsPDF } from 'jspdf';

export const BRAND_DARK: [number, number, number] = [24, 24, 24];
export const BRAND_MID: [number, number, number] = [52, 52, 52];
export const BORDER_SOFT: [number, number, number] = [92, 92, 92];
export const MUTED: [number, number, number] = [78, 78, 78];
export const ROW_TINT: [number, number, number] = [245, 245, 245];
export const ROW_ALT: [number, number, number] = [250, 250, 250];
export const LINE_FAINT: [number, number, number] = [205, 205, 205];
export const OK_GREEN: [number, number, number] = [22, 116, 68];
export const WARN_RED: [number, number, number] = [178, 48, 48];

export const rupees = (value: number | null | undefined) =>
  value === null || value === undefined
    ? '-'
    : `Rs. ${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export function drawBrandBanner(doc: jsPDF, x: number, y: number, w: number, h: number) {
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...BORDER_SOFT);
  doc.setLineWidth(0.45);
  doc.roundedRect(x, y, w, h, 3, 3, 'FD');
}

export function sectionBox(doc: jsPDF, x: number, y: number, w: number, h: number) {
  doc.setDrawColor(...BORDER_SOFT);
  doc.setLineWidth(0.4);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(x, y, w, h, 2.5, 2.5, 'FD');
}

export function fitText(doc: jsPDF, value: string, maxWidth: number) {
  if (doc.getTextWidth(value) <= maxWidth) return value;
  let fitted = value;
  while (fitted.length > 1 && doc.getTextWidth(`${fitted}...`) > maxWidth) {
    fitted = fitted.slice(0, -1);
  }
  return `${fitted.trimEnd()}...`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${src}`));
    img.src = src;
  });
}

// Recolors a black-on-transparent logo PNG to a solid brand color, so the
// same source artwork can be reused, tinted for whatever background it sits on.
export async function recolorLogo(
  src: string,
  color: [number, number, number],
): Promise<{ dataUrl: string; ratio: number } | null> {
  try {
    const img = await loadImage(src);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return { dataUrl: canvas.toDataURL('image/png'), ratio: canvas.width / canvas.height };
  } catch {
    return null;
  }
}

export type BrandImage = { dataUrl: string; ratio: number } | null;

export function loadBrandLogo(): Promise<BrandImage> {
  return recolorLogo('/safawala-crown-dark.png', BRAND_DARK);
}

export function loadBrandSignature(): Promise<BrandImage> {
  return recolorLogo('/ronak-dave-signature.png', BRAND_DARK);
}

// A random owner password to pair with an empty user password: the PDF opens
// and prints freely but can't be edited — the same protection the sale/rental
// invoice uses. Write the encryption option object inline at each call site
// (as the invoice does) so jsPDF's userPermissions union type is inferred
// correctly from the literal array — this only supplies the password half.
export function randomOwnerPassword() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().replaceAll('-', '')
    : `safawala-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// The standard bordered header banner: crown logo + tagline on the left,
// document number / label / date stacked on the right.
export function drawDocumentHeader(
  doc: jsPDF,
  opts: {
    left: number;
    right: number;
    top?: number;
    height?: number;
    logo: BrandImage;
    docNumber: string;
    docLabel: string;
    dateLabel: string;
    // Optional custom-embedded fonts (e.g. Lora/Poppins) for callers that
    // register them; defaults to the built-in Helvetica so every other
    // caller of this shared header keeps its exact current look.
    displayFont?: string;
    bodyFont?: string;
  },
) {
  const top = opts.top ?? 10;
  const height = opts.height ?? 34;
  const displayFont = opts.displayFont ?? 'helvetica';
  const bodyFont = opts.bodyFont ?? 'helvetica';
  drawBrandBanner(doc, opts.left - 6, top, opts.right - opts.left + 12, height);
  if (opts.logo) {
    const logoH = 13;
    const logoW = logoH * opts.logo.ratio;
    doc.addImage(opts.logo.dataUrl, 'PNG', opts.left, top + 5, logoW, logoH);
  } else {
    doc.setTextColor(...BRAND_DARK);
    doc.setFont(displayFont, 'bold');
    doc.setFontSize(18);
    doc.text('SAFAWALA', opts.left, top + 14);
  }
  doc.setTextColor(...MUTED);
  doc.setFont(bodyFont, 'normal');
  doc.setFontSize(8);
  doc.text('Premium Wedding Accessories', opts.left, top + height - 4);

  doc.setTextColor(...BRAND_DARK);
  doc.setFont(displayFont, 'bold');
  doc.setFontSize(13);
  doc.text(opts.docNumber, opts.right, top + 11, { align: 'right' });
  doc.setFontSize(8.5);
  doc.setFont(bodyFont, 'normal');
  doc.text(opts.docLabel, opts.right, top + 18, { align: 'right' });
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text(opts.dateLabel, opts.right, top + 24, { align: 'right' });
  return top + height;
}

// Standard footer: thank-you note on the left, page counter on the right,
// separated by a thin rule. Call once per page after pagination is known.
export function drawFooter(
  doc: jsPDF,
  opts: {
    left: number;
    right: number;
    y?: number;
    note?: string;
    pageNumber: number;
    totalPages: number;
    bodyFont?: string;
  },
) {
  const y = opts.y ?? 285;
  const bodyFont = opts.bodyFont ?? 'helvetica';
  doc.setDrawColor(...BORDER_SOFT);
  doc.setLineWidth(0.3);
  doc.line(opts.left, y, opts.right, y);
  doc.setFont(bodyFont, 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text(opts.note ?? 'Thank you for choosing Safawala.', opts.left, y + 5);
  doc.text(`Page ${opts.pageNumber} of ${opts.totalPages}`, opts.right, y + 5, { align: 'right' });
}

// Stamps the footer (with correct page numbers) on every page of a finished
// document. Call this last, right before doc.save()/doc.output().
export function stampFooterOnAllPages(
  doc: jsPDF,
  opts: { left: number; right: number; y?: number; note?: string; bodyFont?: string },
) {
  const totalPages = doc.getNumberOfPages();
  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    doc.setPage(pageNumber);
    drawFooter(doc, { ...opts, pageNumber, totalPages });
  }
}

// Two-line sign-off block (e.g. "Picked by" / "Checked by"), mirroring the
// invoice's "Authorized Signatory" line.
export function drawSignOffLines(
  doc: jsPDF,
  opts: { left: number; right: number; y: number; leftLabel: string; rightLabel: string; lineWidth?: number },
) {
  const lineWidth = opts.lineWidth ?? Math.min(55, (opts.right - opts.left - 10) / 2);
  doc.setDrawColor(...BORDER_SOFT);
  doc.setLineWidth(0.3);
  doc.line(opts.left, opts.y, opts.left + lineWidth, opts.y);
  doc.line(opts.right - lineWidth, opts.y, opts.right, opts.y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(opts.leftLabel, opts.left, opts.y + 5);
  doc.text(opts.rightLabel, opts.right - lineWidth, opts.y + 5);
}

// A light table header bar (used for item/records tables across every
// document): filled row-tint background, bordered, bold uppercase labels.
export function drawTableHeaderRow(
  doc: jsPDF,
  opts: { x: number; y: number; w: number; h?: number; columns: { label: string; x: number; align?: 'left' | 'right' }[] },
) {
  const h = opts.h ?? 7;
  doc.setFillColor(...ROW_TINT);
  doc.setDrawColor(...BORDER_SOFT);
  doc.setLineWidth(0.3);
  doc.rect(opts.x, opts.y, opts.w, h, 'FD');
  doc.setTextColor(...BRAND_DARK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  opts.columns.forEach((column) =>
    doc.text(column.label, column.x, opts.y + h - 2.2, { align: column.align ?? 'left' }),
  );
  return opts.y + h;
}
