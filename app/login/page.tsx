import { redirect } from 'next/navigation';
import { BrandMark } from '@/components/brand-mark';
import { LoginForm } from '@/components/auth/login-form';
import { getCurrentUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect('/dashboard');
  const configured = Boolean(
    process.env.DATABASE_URL &&
      process.env.SESSION_SECRET &&
      process.env.SESSION_SECRET.length >= 32,
  );

  return (
    <main className="grid min-h-dvh place-items-center bg-surface px-4 py-6 sm:px-8 sm:py-10 lg:px-12">
      <section className="grid w-full max-w-[1040px] overflow-hidden rounded-xl border bg-card shadow-level-2 md:grid-cols-[0.92fr_1.08fr]" aria-labelledby="login-title">
        <div className="relative min-h-64 overflow-hidden bg-[#17110c] bg-cover bg-center p-6 text-white sm:p-8 md:m-4 md:min-h-[580px] md:rounded-lg md:p-10" style={{ backgroundImage: "url('/login-heritage.png')" }}>
          <div aria-hidden="true" className="absolute inset-0 bg-[#120c07]/65" />
          <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/70 to-transparent" />
          <BrandMark inverse className="relative z-10" />
          <div className="relative z-10 mt-12 max-w-sm md:mt-28">
            <h2 className="max-w-[390px] text-[28px] font-semibold leading-[1.25] tracking-[-0.035em] sm:text-[34px] md:text-[40px]">
              Every celebration,<br className="hidden md:block" /> perfectly organized.
            </h2>
            <p className="mt-4 max-w-sm text-sm leading-6 text-white/75">Manage your Safawala relationships, contracts, and work from one quiet, secure place.</p>
          </div>
          <p className="absolute bottom-8 left-10 z-10 hidden text-xs text-white/65 md:block">Built for the Safawala team</p>
        </div>

        <div className="flex items-center px-6 py-10 sm:px-12 md:px-14 lg:px-16">
          <div className="mx-auto w-full max-w-[380px]">
            <div>
              <span className="mb-6 block h-1 w-12 rounded-full bg-primary" aria-hidden="true" />
              <h1 id="login-title" className="text-[28px] font-semibold leading-9 tracking-[-0.03em]">Welcome back</h1>
              <p className="mt-2 text-sm leading-5 text-muted-foreground">Sign in to your Safawala CRM account</p>
            </div>
            <div className="my-7 h-px bg-border" />
            <LoginForm configured={configured} />
            <p className="mt-8 text-center text-xs text-muted-foreground">Securely powered by Safawala CRM</p>
          </div>
        </div>
      </section>
    </main>
  );
}
