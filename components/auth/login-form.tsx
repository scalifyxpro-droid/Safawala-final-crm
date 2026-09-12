'use client';

import { useActionState, useState } from 'react';
import { login, type LoginState } from '@/app/login/actions';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertCircle,
  Eye,
  EyeOff,
  LoaderCircle,
} from 'lucide-react';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginForm({ configured }: { configured: boolean }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    login,
    { error: '' },
  );
  const error = state.error;

  return (
    <form className="mt-8 space-y-5" action={formAction} noValidate>
      {error && (
        <Alert variant="destructive" className="px-3 py-3" aria-live="polite">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <label htmlFor="email" className="block text-sm font-medium">
          Email
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@company.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={Boolean(error && !EMAIL_PATTERN.test(email))}
          required
          className="h-11 rounded-md px-3"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-4">
          <label htmlFor="password" className="block text-sm font-medium">
            Password
          </label>
          <button
            type="button"
            onClick={() => setShowHelp((value) => !value)}
            className="rounded-sm text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Forgot password?
          </button>
        </div>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="Enter your password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            className="h-11 rounded-md px-3 pr-11"
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-md text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? (
              <EyeOff aria-hidden="true" className="size-4" />
            ) : (
              <Eye aria-hidden="true" className="size-4" />
            )}
          </button>
        </div>
        {showHelp && (
          <p className="text-xs leading-5 text-muted-foreground">
            Ask your CRM administrator to reset your password.
          </p>
        )}
      </div>

      <Button
        type="submit"
        disabled={pending || !configured}
        className="h-11 w-full rounded-md"
        aria-describedby={!configured ? 'setup-note' : undefined}
      >
        {pending ? (
          <>
            <LoaderCircle aria-hidden="true" className="animate-spin" /> Signing
            in...
          </>
        ) : (
          'Sign In'
        )}
      </Button>

      {!configured && (
        <p
          id="setup-note"
          className="text-center text-xs leading-5 text-muted-foreground"
        >
          Database setup is required before sign-in is available.
        </p>
      )}
    </form>
  );
}
