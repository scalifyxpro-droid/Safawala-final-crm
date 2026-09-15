'use client';

/* oxlint-disable jsx-a11y/label-has-associated-control -- controls are wrapped by their labels; visible text is supplied by FieldLabel */

import { useActionState, useEffect, useState, useTransition, type FormEvent, type ReactNode } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Check, CheckCircle2, CreditCard, FileDigit, KeyRound, Landmark, Pencil, Plus, Save, ShieldCheck, Star, Trash2, Upload, UserRound, X } from 'lucide-react';
import { DashboardHeader } from '@/components/layout/dashboard-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { changeLoginEmailAction, changePasswordAction, deleteBankAccountAction, saveBankAccountAction, saveDocumentNumbersAction, saveProfileAction, setPrimaryBankAccountAction, type SettingsActionState } from '@/app/settings/actions';
import type { BankAccount, ProfileSettings } from '@/lib/settings/types';

export type DocumentSeries = 'sale_booking' | 'rental_booking' | 'sale_quote' | 'rental_quote';
export type DocumentNumberSetting = { series: DocumentSeries; prefix: string; next_number: number; number_padding: number; sequence_year: number };
type SettingsTab = 'numbering' | 'banking' | 'profile' | 'security';

const currentYear = new Date().getFullYear();
const seriesConfig: Array<{ series: DocumentSeries; title: string; description: string; prefix: string }> = [
  { series: 'sale_booking', title: 'Sale booking invoices', description: 'New sale booking numbers', prefix: 'SW-S-' },
  { series: 'rental_booking', title: 'Rental booking invoices', description: 'New rental booking numbers', prefix: 'SW-R-' },
  { series: 'sale_quote', title: 'Sale quotations', description: 'New sale quotation numbers', prefix: 'SW-Q-S-' },
  { series: 'rental_quote', title: 'Rental quotations', description: 'New rental quotation numbers', prefix: 'SW-Q-R-' },
];
const tabs: Array<{ key: SettingsTab; label: string; icon: typeof FileDigit }> = [
  { key: 'numbering', label: 'Document numbering', icon: FileDigit },
  { key: 'banking', label: 'Banking details', icon: Landmark },
  { key: 'profile', label: 'Profile', icon: UserRound },
  { key: 'security', label: 'Security', icon: ShieldCheck },
];
const INITIAL_ACTION_STATE: SettingsActionState = { error: '', notice: '' };

function normalizedPrefix(value: string) {
  const compact = value.trim().toUpperCase().replace(/\s+/g, '-').replace(/-\d{4}-?$/, '');
  return compact.endsWith('-') ? compact : `${compact}-`;
}
function initialRows(rows: DocumentNumberSetting[]) {
  return seriesConfig.map((config) => {
    const saved = rows.find((row) => row.series === config.series);
    return { series: config.series, prefix: saved?.prefix ?? config.prefix, next_number: Number(saved?.next_number ?? 1), number_padding: Number(saved?.number_padding ?? 4), sequence_year: Number(saved?.sequence_year ?? currentYear) };
  });
}
function maskedAccount(value: string) { return `•••• ${value.slice(-4)}`; }
function FieldLabel({ children, required = false }: { children: ReactNode; required?: boolean }) {
  return <span className="text-sm font-medium">{children}{required ? <span className="ml-0.5 text-destructive">*</span> : null}</span>;
}

export function SettingsPanel({ currentEmail, initialSettings, initialProfile, initialBankAccounts, loadError }: {
  currentEmail: string;
  initialSettings: DocumentNumberSetting[];
  initialProfile: ProfileSettings;
  initialBankAccounts: BankAccount[];
  loadError: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<SettingsTab>('numbering');
  const [settings, setSettings] = useState(() => initialRows(initialSettings));
  const [banks, setBanks] = useState(initialBankAccounts);
  const [bankModal, setBankModal] = useState<BankAccount | 'new' | null>(null);
  const [numberBusy, setNumberBusy] = useState(false);
  const [formBusy, setFormBusy] = useState(false);
  const [error, setError] = useState(loadError);
  const [notice, setNotice] = useState('');
  const [avatarRemoved, setAvatarRemoved] = useState(false);
  const [password, setPassword] = useState('');
  const [, startTransition] = useTransition();
  const [emailState, emailAction, emailPending] = useActionState(changeLoginEmailAction, INITIAL_ACTION_STATE);
  const [passwordState, passwordAction, passwordPending] = useActionState(changePasswordAction, INITIAL_ACTION_STATE);
  const displayedError = emailState.error || passwordState.error || error;
  const displayedNotice = emailState.notice || passwordState.notice || notice;

  useEffect(() => setBanks(initialBankAccounts), [initialBankAccounts]);
  useEffect(() => setSettings(initialRows(initialSettings)), [initialSettings]);

  function showResult(result: SettingsActionState) {
    setError(result.error); setNotice(result.notice);
    if (!result.error) startTransition(() => router.refresh());
  }
  async function saveDocumentNumbers() {
    if (numberBusy) return;
    const normalized = settings.map((setting) => ({ ...setting, prefix: normalizedPrefix(setting.prefix), next_number: Number(setting.next_number), number_padding: Number(setting.number_padding), sequence_year: Number(setting.sequence_year) }));
    if (normalized.some((setting) => !/^[A-Z0-9-]{2,24}-$/.test(setting.prefix) || !Number.isInteger(setting.next_number) || setting.next_number < 1 || setting.next_number > 99999999 || !Number.isInteger(setting.number_padding) || setting.number_padding < 2 || setting.number_padding > 8 || !Number.isInteger(setting.sequence_year) || setting.sequence_year < 2000 || setting.sequence_year > 9999)) {
      setError('Use a valid prefix, year, next number and digit count.'); return;
    }
    setNumberBusy(true);
    try {
      const saved = await saveDocumentNumbersAction(normalized);
      setSettings(initialRows(saved as DocumentNumberSetting[]));
      showResult({ error: '', notice: 'Document numbering settings saved successfully.' });
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'Unable to save document numbering settings.'); }
    finally { setNumberBusy(false); }
  }
  function updateSetting(series: DocumentSeries, field: keyof Omit<DocumentNumberSetting, 'series'>, value: string) {
    setSettings((current) => current.map((setting) => setting.series === series ? { ...setting, [field]: field === 'prefix' ? value : Number(value) } : setting));
  }
  async function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setFormBusy(true);
    const formData = new FormData(event.currentTarget); formData.set('remove_avatar', String(avatarRemoved));
    try {
      const result = await saveProfileAction(formData);
      showResult(result);
      if (!result.error) window.dispatchEvent(new Event('profile-settings-updated'));
    } finally { setFormBusy(false); }
  }
  async function submitBank(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setFormBusy(true);
    try { const result = await saveBankAccountAction(new FormData(event.currentTarget)); showResult(result); if (!result.error) setBankModal(null); }
    finally { setFormBusy(false); }
  }
  async function setPrimary(id: string) { setFormBusy(true); try { showResult(await setPrimaryBankAccountAction(id)); } finally { setFormBusy(false); } }
  async function removeBank(account: BankAccount) {
    if (!window.confirm(`Remove ${account.bank_name} ${maskedAccount(account.account_number)}?`)) return;
    setFormBusy(true); try { showResult(await deleteBankAccountAction(account.id)); } finally { setFormBusy(false); }
  }
  const passwordChecks = [
    { label: 'At least 8 characters', pass: password.length >= 8 },
    { label: 'Uppercase and lowercase', pass: /[A-Z]/.test(password) && /[a-z]/.test(password) },
    { label: 'A number', pass: /[0-9]/.test(password) },
    { label: 'A symbol', pass: /[^A-Za-z0-9]/.test(password) },
  ];

  return (
    <div className="mx-auto max-w-[1240px] space-y-5">
      <DashboardHeader title="Settings" subtitle="Manage numbering, payment details, profile and account security" backHref="/dashboard" />
      <div className="overflow-x-auto rounded-xl border bg-white p-1.5 shadow-level-1 dark:bg-card [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="grid min-w-[680px] grid-cols-4 gap-1.5">
          {tabs.map(({ key, label, icon: Icon }) => <button key={key} type="button" onClick={() => { setTab(key); setError(''); setNotice(''); }} className={`flex h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition ${tab === key ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-[#f7f4ef] hover:text-foreground dark:hover:bg-[#241e17]'}`} aria-current={tab === key ? 'page' : undefined}><Icon className="size-4" />{label}</button>)}
        </div>
      </div>

      {displayedError ? <Alert variant="destructive"><AlertTitle>Settings could not be updated</AlertTitle><AlertDescription>{displayedError}</AlertDescription></Alert> : null}
      {displayedNotice && !displayedError ? <Alert className="border-emerald-200 bg-emerald-50 text-emerald-800"><CheckCircle2 /><AlertTitle>Saved</AlertTitle><AlertDescription>{displayedNotice}</AlertDescription></Alert> : null}

      {tab === 'numbering' ? <NumberingPanel settings={settings} busy={numberBusy} onUpdate={updateSetting} onSave={saveDocumentNumbers} /> : null}
      {tab === 'banking' ? <BankingPanel banks={banks} busy={formBusy} onAdd={() => setBankModal('new')} onEdit={setBankModal} onPrimary={setPrimary} onDelete={removeBank} /> : null}
      {tab === 'profile' ? <ProfilePanel email={currentEmail} profile={initialProfile} busy={formBusy} avatarRemoved={avatarRemoved} onAvatarRemoved={setAvatarRemoved} onSubmit={submitProfile} emailAction={emailAction} emailPending={emailPending} /> : null}
      {tab === 'security' ? <SecurityPanel password={password} onPassword={setPassword} checks={passwordChecks} action={passwordAction} pending={passwordPending} /> : null}
      {bankModal ? <BankAccountModal account={bankModal === 'new' ? null : bankModal} busy={formBusy} onClose={() => setBankModal(null)} onSubmit={submitBank} /> : null}
    </div>
  );
}

function NumberingPanel({ settings, busy, onUpdate, onSave }: { settings: DocumentNumberSetting[]; busy: boolean; onUpdate: (series: DocumentSeries, field: keyof Omit<DocumentNumberSetting, 'series'>, value: string) => void; onSave: () => void }) {
  return <Card className="border-border shadow-level-1 ring-0"><CardHeader className="border-b bg-[#fcfaf7] dark:bg-[#241e17]"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-lg bg-primary text-primary-foreground"><FileDigit className="size-5" /></span><div><CardTitle>Document numbering</CardTitle><CardDescription>Existing documents remain unchanged; new documents use these sequences.</CardDescription></div></div></CardHeader><CardContent className="space-y-5"><div className="grid gap-4 lg:grid-cols-2">{seriesConfig.map((config) => {
    const setting = settings.find((row) => row.series === config.series)!;
    const preview = `${normalizedPrefix(setting.prefix || config.prefix)}${setting.sequence_year || currentYear}-${String(setting.next_number || 1).padStart(setting.number_padding || 4, '0')}`;
    return <div key={config.series} className="rounded-xl border bg-white p-4 dark:bg-card"><h3 className="font-semibold">{config.title}</h3><p className="mt-1 text-sm text-muted-foreground">{config.description}</p><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-[1.2fr_.75fr_.75fr_.6fr]"><label className="space-y-1.5"><FieldLabel>Prefix</FieldLabel><Input value={setting.prefix} onChange={(e) => onUpdate(config.series, 'prefix', e.target.value)} className="h-10 uppercase" /></label><label className="space-y-1.5"><FieldLabel>Year</FieldLabel><Input type="number" min={2000} max={9999} value={setting.sequence_year} onChange={(e) => onUpdate(config.series, 'sequence_year', e.target.value)} className="h-10" /></label><label className="space-y-1.5"><FieldLabel>Next number</FieldLabel><Input type="number" min={1} max={99999999} value={setting.next_number} onChange={(e) => onUpdate(config.series, 'next_number', e.target.value)} className="h-10" /></label><label className="space-y-1.5"><FieldLabel>Digits</FieldLabel><Input type="number" min={2} max={8} value={setting.number_padding} onChange={(e) => onUpdate(config.series, 'number_padding', e.target.value)} className="h-10" /></label></div><div className="mt-4 rounded-lg border border-[#e4d2b6] bg-[#fcfaf7] px-3 py-2.5 dark:bg-[#241e17]"><p className="text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground">Next preview</p><p className="mt-1 font-mono text-sm font-semibold text-[#70481c]">{preview}</p></div></div>;
  })}</div><div className="flex justify-end border-t pt-4"><Button type="button" onClick={onSave} disabled={busy}><Save />{busy ? 'Saving…' : 'Save numbering settings'}</Button></div></CardContent></Card>;
}

function BankingPanel({ banks, busy, onAdd, onEdit, onPrimary, onDelete }: { banks: BankAccount[]; busy: boolean; onAdd: () => void; onEdit: (bank: BankAccount) => void; onPrimary: (id: string) => void; onDelete: (bank: BankAccount) => void }) {
  return <div className="space-y-4"><Card className="border-border shadow-level-1 ring-0"><CardHeader className="flex-row items-start justify-between gap-4 border-b bg-[#fcfaf7] dark:bg-[#241e17]"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-lg bg-accent text-accent-foreground"><Landmark className="size-5" /></span><div><CardTitle>Banking details</CardTitle><CardDescription>The primary account appears on customer invoices and quotations.</CardDescription></div></div><Button type="button" onClick={onAdd}><Plus />Add account</Button></CardHeader><CardContent className="p-0">{banks.length ? <div className="divide-y">{banks.map((account) => <article key={account.id} className="grid gap-4 p-5 md:grid-cols-[minmax(0,1.2fr)_minmax(0,.9fr)_auto] md:items-center"><div className="flex min-w-0 items-center gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#f5ead8] text-[#70481c]"><CreditCard className="size-5" /></span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-semibold">{account.bank_name}</h3>{account.is_primary ? <Badge className="bg-emerald-50 text-emerald-700"><Star />Primary</Badge> : null}</div><p className="mt-1 truncate text-sm text-muted-foreground">{account.account_holder_name} · {maskedAccount(account.account_number)}</p></div></div><div className="grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs text-muted-foreground">IFSC</p><p className="mt-0.5 font-medium">{account.ifsc_code}</p></div><div><p className="text-xs text-muted-foreground">UPI</p><p className="mt-0.5 truncate font-medium">{account.upi_id || 'Not added'}</p></div></div><div className="flex flex-wrap justify-end gap-2">{!account.is_primary ? <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onPrimary(account.id)}><Check />Make primary</Button> : null}<Button type="button" size="sm" variant="outline" onClick={() => onEdit(account)}><Pencil />Edit</Button><Button type="button" size="icon" variant="ghost" aria-label={`Delete ${account.bank_name}`} disabled={busy} onClick={() => onDelete(account)}><Trash2 className="text-destructive" /></Button></div></article>)}</div> : <div className="grid min-h-64 place-items-center p-8 text-center"><div><span className="mx-auto grid size-12 place-items-center rounded-full bg-[#f5ead8] text-[#70481c]"><Landmark /></span><h3 className="mt-3 font-semibold">No bank account added</h3><p className="mt-1 text-sm text-muted-foreground">Add the account customers should use for payments.</p><Button className="mt-4" onClick={onAdd}><Plus />Add first account</Button></div></div>}</CardContent></Card><div className="grid gap-3 sm:grid-cols-3">{['Invoice payment section', 'Quotation PDFs', 'UPI payment QR'].map((label) => <div key={label} className="flex items-center gap-2 rounded-xl border bg-white px-4 py-3 text-sm shadow-level-1 dark:bg-card"><CheckCircle2 className="size-4 text-emerald-600" />{label}</div>)}</div></div>;
}

function ProfilePanel({ email, profile, busy, avatarRemoved, onAvatarRemoved, onSubmit, emailAction, emailPending }: { email: string; profile: ProfileSettings; busy: boolean; avatarRemoved: boolean; onAvatarRemoved: (value: boolean) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; emailAction: (payload: FormData) => void; emailPending: boolean }) {
  return <div className="grid gap-5 xl:grid-cols-[1.45fr_.75fr]"><Card className="border-border shadow-level-1 ring-0"><CardHeader className="border-b bg-[#fcfaf7] dark:bg-[#241e17]"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-lg bg-accent text-accent-foreground"><UserRound className="size-5" /></span><div><CardTitle>Profile details</CardTitle><CardDescription>Your administrator identity across the CRM.</CardDescription></div></div></CardHeader><CardContent><form onSubmit={onSubmit} className="space-y-5"><div className="flex flex-wrap items-center gap-4 rounded-xl border bg-[#fcfaf7] p-4 dark:bg-[#241e17]"><span className="relative grid size-16 overflow-hidden rounded-xl border bg-white text-[#70481c] dark:bg-card">{profile.avatar_url && !avatarRemoved ? <Image src={profile.avatar_url} alt="Profile" fill unoptimized className="object-cover" /> : <UserRound className="m-auto size-7" />}</span><div><label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-medium shadow-sm dark:bg-card"><Upload className="size-4" />Choose photo<input type="file" name="avatar" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={() => onAvatarRemoved(false)} /></label><p className="mt-1.5 text-xs text-muted-foreground">JPEG, PNG or WebP · maximum 2 MB</p></div>{profile.avatar_url && !avatarRemoved ? <Button type="button" variant="ghost" size="sm" onClick={() => onAvatarRemoved(true)}>Remove</Button> : null}</div><div className="grid gap-4 sm:grid-cols-2"><label className="space-y-1.5 sm:col-span-2"><FieldLabel required>Full name</FieldLabel><Input name="full_name" defaultValue={profile.full_name} required /></label><label className="space-y-1.5"><FieldLabel>Phone number</FieldLabel><Input name="phone" type="tel" defaultValue={profile.phone ?? ''} placeholder="+91 98765 43210" /></label><label className="space-y-1.5"><FieldLabel>Employee ID</FieldLabel><Input name="employee_id" defaultValue={profile.employee_id ?? ''} placeholder="EMP001" className="uppercase" /></label><label className="space-y-1.5"><FieldLabel>Designation</FieldLabel><Input name="designation" defaultValue={profile.designation ?? ''} placeholder="Administrator" /></label><label className="space-y-1.5"><FieldLabel>Department</FieldLabel><Input name="department" defaultValue={profile.department ?? ''} placeholder="Operations" /></label><label className="space-y-1.5"><FieldLabel>Date of joining</FieldLabel><Input name="date_of_joining" type="date" defaultValue={profile.date_of_joining ?? ''} /></label><label className="space-y-1.5"><FieldLabel>Language</FieldLabel><select name="language_preference" defaultValue={profile.language_preference} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"><option value="en">English</option><option value="hi">Hindi</option><option value="gu">Gujarati</option></select></label></div><div className="border-t pt-5"><h3 className="font-semibold">Emergency contact</h3><div className="mt-3 grid gap-4 sm:grid-cols-2"><label className="space-y-1.5"><FieldLabel>Contact name</FieldLabel><Input name="emergency_contact_name" defaultValue={profile.emergency_contact_name ?? ''} /></label><label className="space-y-1.5"><FieldLabel>Contact phone</FieldLabel><Input name="emergency_contact_phone" type="tel" defaultValue={profile.emergency_contact_phone ?? ''} /></label></div></div><div className="flex justify-end"><Button type="submit" disabled={busy}><Save />{busy ? 'Saving…' : 'Save profile'}</Button></div></form></CardContent></Card><Card className="h-fit border-border shadow-level-1 ring-0"><CardHeader className="border-b"><CardTitle>Login email</CardTitle><CardDescription>The ID used to sign in to this account.</CardDescription></CardHeader><CardContent><form className="space-y-4" action={emailAction}><label className="block space-y-1.5"><FieldLabel required>Email address</FieldLabel><Input name="email" type="email" autoComplete="email" defaultValue={email} required /></label><Button type="submit" disabled={emailPending}>{emailPending ? 'Saving…' : 'Update email'}</Button></form></CardContent></Card></div>;
}

function SecurityPanel({ password, onPassword, checks, action, pending }: { password: string; onPassword: (value: string) => void; checks: Array<{ label: string; pass: boolean }>; action: (payload: FormData) => void; pending: boolean }) {
  return <div className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]"><Card className="border-border shadow-level-1 ring-0"><CardHeader className="border-b bg-[#fcfaf7] dark:bg-[#241e17]"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-lg bg-accent text-accent-foreground"><KeyRound className="size-5" /></span><div><CardTitle>Change password</CardTitle><CardDescription>Your current password is required before any change.</CardDescription></div></div></CardHeader><CardContent><form className="space-y-4" action={action}><label className="block space-y-1.5"><FieldLabel required>Current password</FieldLabel><Input name="current_password" type="password" autoComplete="current-password" required /></label><div className="grid gap-4 sm:grid-cols-2"><label className="space-y-1.5"><FieldLabel required>New password</FieldLabel><Input name="password" type="password" autoComplete="new-password" minLength={8} value={password} onChange={(event) => onPassword(event.target.value)} required /></label><label className="space-y-1.5"><FieldLabel required>Confirm new password</FieldLabel><Input name="password_confirmation" type="password" autoComplete="new-password" minLength={8} required /></label></div><div className="grid gap-2 rounded-xl border bg-[#fcfaf7] p-4 text-sm dark:bg-[#241e17] sm:grid-cols-2">{checks.map((check) => <span key={check.label} className={`flex items-center gap-2 ${check.pass ? 'text-emerald-700' : 'text-muted-foreground'}`}><span className={`grid size-4 place-items-center rounded-full border ${check.pass ? 'border-emerald-500 bg-emerald-500 text-white' : ''}`}>{check.pass ? <Check className="size-3" /> : null}</span>{check.label}</span>)}</div><div className="flex justify-end"><Button type="submit" disabled={pending}>{pending ? 'Changing…' : 'Change password'}</Button></div></form></CardContent></Card><Card className="h-fit border-emerald-200 bg-emerald-50/60 shadow-level-1 ring-0"><CardContent className="flex gap-3 p-5"><ShieldCheck className="size-6 shrink-0 text-emerald-700" /><div><h3 className="font-semibold text-emerald-900">Secure account protection</h3><p className="mt-1 text-sm leading-6 text-emerald-800">Passwords are securely hashed. Changing your password refreshes your signed-in session without exposing it to the browser or database logs.</p></div></CardContent></Card></div>;
}

function BankAccountModal({ account, busy, onClose, onSubmit }: { account: BankAccount | null; busy: boolean; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-3 sm:p-5" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border bg-white shadow-2xl dark:bg-card" role="dialog" aria-modal="true" aria-labelledby="bank-dialog-title"><div className="sticky top-0 z-10 flex items-start justify-between border-b bg-white px-5 py-4 dark:bg-card sm:px-6"><div><h2 id="bank-dialog-title" className="text-lg font-semibold">{account ? 'Edit bank account' : 'Add bank account'}</h2><p className="mt-1 text-sm text-muted-foreground">Saved securely and used on customer payment documents.</p></div><Button type="button" size="icon" variant="ghost" onClick={onClose} aria-label="Close"><X /></Button></div><form onSubmit={onSubmit} className="space-y-5 p-5 sm:p-6">{account ? <input type="hidden" name="id" value={account.id} /> : null}<div className="grid gap-4 sm:grid-cols-2"><label className="space-y-1.5"><FieldLabel required>Bank name</FieldLabel><Input name="bank_name" defaultValue={account?.bank_name ?? ''} placeholder="ICICI Bank" required /></label><label className="space-y-1.5"><FieldLabel required>Account holder</FieldLabel><Input name="account_holder_name" defaultValue={account?.account_holder_name ?? ''} required /></label><label className="space-y-1.5"><FieldLabel required>Account number</FieldLabel><Input name="account_number" inputMode="numeric" defaultValue={account?.account_number ?? ''} pattern="[0-9]{6,20}" required /></label><label className="space-y-1.5"><FieldLabel required>IFSC code</FieldLabel><Input name="ifsc_code" defaultValue={account?.ifsc_code ?? ''} maxLength={11} className="uppercase" required /></label><label className="space-y-1.5"><FieldLabel>Branch</FieldLabel><Input name="branch_name" defaultValue={account?.branch_name ?? ''} /></label><label className="space-y-1.5"><FieldLabel>UPI ID</FieldLabel><Input name="upi_id" defaultValue={account?.upi_id ?? ''} placeholder="name@bank" /></label></div><div className="rounded-xl border border-dashed bg-[#fcfaf7] p-4 dark:bg-[#241e17]"><label className="flex cursor-pointer items-center gap-3"><span className="grid size-10 place-items-center rounded-lg border bg-white dark:bg-card"><Upload className="size-4" /></span><span><strong className="block text-sm">Payment QR image</strong><span className="text-xs text-muted-foreground">JPEG, PNG or WebP · maximum 2 MB</span></span><input type="file" name="qr_code" accept="image/jpeg,image/png,image/webp" className="sr-only" /></label>{account?.qr_code_image ? <label className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" name="remove_qr" value="true" />Remove existing QR image</label> : null}</div><label className="flex items-center justify-between rounded-xl border p-4"><span><strong className="block text-sm">Set as primary account</strong><span className="mt-0.5 block text-xs text-muted-foreground">Used by default on invoices and quotations.</span></span><input type="checkbox" name="is_primary" value="true" defaultChecked={account?.is_primary ?? false} className="size-5 accent-[#a96f2b]" /></label><div className="flex justify-end gap-2 border-t pt-4"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}><Save />{busy ? 'Saving…' : account ? 'Save changes' : 'Add account'}</Button></div></form></div></div>;
}
