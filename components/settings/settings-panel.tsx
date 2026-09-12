'use client';

import { useActionState, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, FileDigit, KeyRound, Save, UserRound } from 'lucide-react';
import { DashboardHeader } from '@/components/layout/dashboard-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  changeLoginEmailAction,
  changePasswordAction,
  saveDocumentNumbersAction,
  type SettingsActionState,
} from '@/app/settings/actions';

export type DocumentSeries =
  | 'sale_booking'
  | 'rental_booking'
  | 'sale_quote'
  | 'rental_quote';

export type DocumentNumberSetting = {
  series: DocumentSeries;
  prefix: string;
  next_number: number;
  number_padding: number;
  sequence_year: number;
};

const currentYear = new Date().getFullYear();
const seriesConfig: Array<{
  series: DocumentSeries;
  title: string;
  description: string;
  prefix: string;
}> = [
  {
    series: 'sale_booking',
    title: 'Sale booking invoices',
    description: 'Numbers for completed and active sale bookings',
    prefix: 'SW-S-',
  },
  {
    series: 'rental_booking',
    title: 'Rental booking invoices',
    description: 'Numbers for completed and active rental bookings',
    prefix: 'SW-R-',
  },
  {
    series: 'sale_quote',
    title: 'Sale quotations',
    description: 'Numbers used when a sale quote is created',
    prefix: 'SW-Q-S-',
  },
  {
    series: 'rental_quote',
    title: 'Rental quotations',
    description: 'Numbers used when a rental quote is created',
    prefix: 'SW-Q-R-',
  },
];

const INITIAL_ACTION_STATE: SettingsActionState = { error: '', notice: '' };

function normalizedPrefix(value: string) {
  const compact = value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '-')
    .replace(/-\d{4}-?$/, '');
  return compact.endsWith('-') ? compact : `${compact}-`;
}

function initialRows(rows: DocumentNumberSetting[]) {
  return seriesConfig.map((config) => {
    const saved = rows.find((row) => row.series === config.series);
    return {
      series: config.series,
      prefix: saved?.prefix ?? config.prefix,
      next_number: saved?.next_number ?? 1,
      number_padding: saved?.number_padding ?? 4,
      sequence_year: saved?.sequence_year ?? currentYear,
    };
  });
}

export function SettingsPanel({
  currentEmail,
  initialSettings,
  loadError,
}: {
  currentEmail: string;
  initialSettings: DocumentNumberSetting[];
  loadError: string;
}) {
  const router = useRouter();
  const [settings, setSettings] = useState(() => initialRows(initialSettings));
  const [numberBusy, setNumberBusy] = useState(false);
  const [error, setError] = useState(loadError);
  const [notice, setNotice] = useState('');
  const [, startTransition] = useTransition();

  const [emailState, emailAction, emailPending] = useActionState(changeLoginEmailAction, INITIAL_ACTION_STATE);
  const [passwordState, passwordAction, passwordPending] = useActionState(changePasswordAction, INITIAL_ACTION_STATE);
  const displayedError = emailState.error || passwordState.error || error;
  const displayedNotice = emailState.notice || passwordState.notice || notice;

  function message(text: string) {
    setError('');
    setNotice(text);
  }

  async function saveDocumentNumbers() {
    if (numberBusy) return;
    const normalized = settings.map((setting) => ({
      ...setting,
      prefix: normalizedPrefix(setting.prefix),
      next_number: Number(setting.next_number),
      number_padding: Number(setting.number_padding),
      sequence_year: Number(setting.sequence_year),
    }));
    if (
      normalized.some(
        (setting) =>
          !/^[A-Z0-9-]{2,24}-$/.test(setting.prefix) ||
          !Number.isInteger(setting.next_number) ||
          setting.next_number < 1 ||
          setting.next_number > 99999999 ||
          !Number.isInteger(setting.number_padding) ||
          setting.number_padding < 2 ||
          setting.number_padding > 8 ||
          !Number.isInteger(setting.sequence_year) ||
          setting.sequence_year < 2000 ||
          setting.sequence_year > 9999,
      )
    ) {
      setError('Use letters, numbers and hyphens for prefixes. Number range must be valid.');
      return;
    }

    setNumberBusy(true);
    setError('');
    setNotice('');
    try {
      const saved = await saveDocumentNumbersAction(normalized);
      setSettings(initialRows(saved as DocumentNumberSetting[]));
      message('Document numbering settings saved successfully.');
      startTransition(() => router.refresh());
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to save document numbering settings.');
    } finally {
      setNumberBusy(false);
    }
  }

  function updateSetting(
    series: DocumentSeries,
    field: 'prefix' | 'next_number' | 'number_padding' | 'sequence_year',
    value: string,
  ) {
    setSettings((current) =>
      current.map((setting) =>
        setting.series === series
          ? {
              ...setting,
              [field]: field === 'prefix' ? value : Number(value),
            }
          : setting,
      ),
    );
  }

  return (
    <div className="mx-auto max-w-[1180px] space-y-6">
      <DashboardHeader
        title="Settings"
        subtitle="Manage account access and document numbering"
        backHref="/dashboard"
      />

      {displayedError ? (
        <Alert variant="destructive">
          <AlertTitle>Settings could not be updated</AlertTitle>
          <AlertDescription>{displayedError}</AlertDescription>
        </Alert>
      ) : null}
      {displayedNotice && !displayedError ? (
        <Alert className="border-emerald-200 bg-emerald-50 text-emerald-800">
          <CheckCircle2 />
          <AlertTitle>Saved</AlertTitle>
          <AlertDescription className="text-emerald-700">{displayedNotice}</AlertDescription>
        </Alert>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-2">
        <Card className="border-border shadow-level-1 ring-0">
          <CardHeader className="border-b bg-[#fcfaf7] dark:bg-[#241e17]">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-lg bg-accent text-accent-foreground">
                <UserRound className="size-5" />
              </span>
              <div>
                <CardTitle>Login email</CardTitle>
                <CardDescription>Change the ID used to sign in</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" action={emailAction}>
              <label className="block text-sm font-medium" htmlFor="login-email">
                New login email
              </label>
              <Input
                id="login-email"
                name="email"
                type="email"
                autoComplete="email"
                defaultValue={currentEmail}
                className="h-11"
                required
              />
              <Button type="submit" disabled={emailPending}>
                Save login email
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="border-border shadow-level-1 ring-0">
          <CardHeader className="border-b bg-[#fcfaf7] dark:bg-[#241e17]">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-lg bg-accent text-accent-foreground">
                <KeyRound className="size-5" />
              </span>
              <div>
                <CardTitle>Password</CardTitle>
                <CardDescription>Use at least 8 characters</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4 sm:grid-cols-2" action={passwordAction}>
              <label className="space-y-1.5 text-sm font-medium" htmlFor="new-password">
                <span>New password</span>
                <Input
                  id="new-password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  className="h-11"
                  minLength={8}
                  required
                />
              </label>
              <label className="space-y-1.5 text-sm font-medium" htmlFor="confirm-password">
                <span>Confirm password</span>
                <Input
                  id="confirm-password"
                  name="password_confirmation"
                  type="password"
                  autoComplete="new-password"
                  className="h-11"
                  minLength={8}
                  required
                />
              </label>
              <Button type="submit" className="sm:col-span-2 sm:w-fit" disabled={passwordPending}>
                Change password
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>

      <Card className="border-border shadow-level-1 ring-0">
        <CardHeader className="border-b bg-[#fcfaf7] dark:bg-[#241e17]">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-lg bg-primary text-primary-foreground">
              <FileDigit className="size-5" />
            </span>
            <div>
              <CardTitle>Document numbering</CardTitle>
              <CardDescription>
                Configure the prefix, year and next number for each independent series
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 lg:grid-cols-2">
            {seriesConfig.map((config) => {
              const setting = settings.find((row) => row.series === config.series)!;
              const prefix = normalizedPrefix(setting.prefix || config.prefix);
              const preview = `${prefix}${setting.sequence_year || currentYear}-${String(setting.next_number || 1).padStart(setting.number_padding || 4, '0')}`;
              return (
                <div key={config.series} className="rounded-xl border bg-white dark:bg-card p-4">
                  <div className="mb-4">
                    <h3 className="font-semibold">{config.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{config.description}</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1.2fr_.75fr_.75fr_.6fr]">
                    <label
                      className="space-y-1.5 text-sm font-medium"
                      htmlFor={`${config.series}-prefix`}
                    >
                      <span>Prefix</span>
                      <Input
                        id={`${config.series}-prefix`}
                        value={setting.prefix}
                        onChange={(event) => updateSetting(config.series, 'prefix', event.target.value)}
                        aria-label={`${config.title} prefix`}
                        className="h-10 uppercase"
                      />
                    </label>
                    <label
                      className="space-y-1.5 text-sm font-medium"
                      htmlFor={`${config.series}-year`}
                    >
                      <span>Year</span>
                      <Input
                        id={`${config.series}-year`}
                        type="number"
                        min={2000}
                        max={9999}
                        value={setting.sequence_year}
                        onChange={(event) => updateSetting(config.series, 'sequence_year', event.target.value)}
                        aria-label={`${config.title} year`}
                        className="h-10"
                      />
                    </label>
                    <label
                      className="space-y-1.5 text-sm font-medium"
                      htmlFor={`${config.series}-next-number`}
                    >
                      <span>Next number</span>
                      <Input
                        id={`${config.series}-next-number`}
                        type="number"
                        min={1}
                        max={99999999}
                        value={setting.next_number}
                        onChange={(event) => updateSetting(config.series, 'next_number', event.target.value)}
                        aria-label={`${config.title} next number`}
                        className="h-10"
                      />
                    </label>
                    <label
                      className="space-y-1.5 text-sm font-medium"
                      htmlFor={`${config.series}-digits`}
                    >
                      <span>Digits</span>
                      <Input
                        id={`${config.series}-digits`}
                        type="number"
                        min={2}
                        max={8}
                        value={setting.number_padding}
                        onChange={(event) => updateSetting(config.series, 'number_padding', event.target.value)}
                        aria-label={`${config.title} digits`}
                        className="h-10"
                      />
                    </label>
                  </div>
                  <div className="mt-4 rounded-lg border border-[#e4d2b6] bg-[#fcfaf7] dark:bg-[#241e17] px-3 py-2.5">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Preview</p>
                    <p className="mt-1 font-mono text-sm font-semibold text-[#70481c]">{preview}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Existing invoices remain unchanged. New documents use the saved series.
            </p>
            <Button type="button" onClick={saveDocumentNumbers} disabled={numberBusy}>
              <Save />
              Save numbering settings
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
