import { NextResponse, type NextRequest } from 'next/server';
import { verifySessionToken } from '@/lib/auth/jwt';
import { withUserContext } from '@/lib/db/client';
import { accessModuleForPath } from '@/lib/staff-portal/access-modules';

// Next.js 16 Proxy always runs on the Node.js runtime, which is required by
// postgres.js for raw TCP database connections.

const SESSION_COOKIE = 'crm_session';

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const response = NextResponse.next({ request });

  // API routes authenticate and authorize themselves (see app/api/*/route.ts).
  // Same reasoning as the original Supabase-backed middleware: redirecting an
  // API call sends the browser a redirected response with the method
  // preserved, which breaks POST/PATCH/DELETE routes with an opaque 500.
  if (path.startsWith('/api/')) {
    return response;
  }
  // Public login pages must stay completely unauthenticated — no DB round
  // trip before the form can render.
  if (path === '/login' || path === '/staff-portal/login') {
    return response;
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const claims = token ? await verifySessionToken(token) : null;

  // Staff Portal pages perform the complete role/active/department/module
  // checks in their own server-side guards (see lib/staff-portal/guard.ts).
  // This is only a routing shortcut so a signed-out visit to a staff-portal
  // page bounces straight to its login page without rendering first.
  if (path.startsWith('/staff-portal') && path !== '/staff-portal/login' && !claims) {
    return NextResponse.redirect(new URL('/staff-portal/login', request.url));
  }

  if (!claims) {
    if (path.startsWith('/dashboard')) return NextResponse.redirect(new URL('/login', request.url));
    return response;
  }

  const requestedModule = accessModuleForPath(path);
  const { role, staffAccountActive, staffPortalKind, canAccessModule } = await withUserContext(claims.sub, async (tx) => {
    const [profileRows, staffRows, accessRows] = await Promise.all([
      tx<{ role: string }[]>`select role from public.profiles where id = ${claims.sub}`,
      tx<{ portal_active: boolean; is_active: boolean; portal_kind: string }[]>`
        select portal_active, is_active, portal_kind from public.staff_members where user_id = ${claims.sub}
      `,
      requestedModule
        ? tx<{ staff_can_access: boolean }[]>`select public.staff_can_access(${requestedModule})`
        : Promise.resolve([{ staff_can_access: false }]),
    ]);
    // No `?? 'admin'` fallback here: a session whose `public.profiles` row is
    // missing (e.g. not yet created for a brand-new login) must NOT be
    // treated as an admin. `null` falls through every role-specific branch
    // below and is explicitly denied just after this transaction returns.
    const profileRole = profileRows[0]?.role ?? null;
    const staff = staffRows[0];
    return {
      role: profileRole,
      staffAccountActive: profileRole === 'staff' ? Boolean(staff?.portal_active && staff.is_active) : true,
      staffPortalKind: staff?.portal_kind ?? 'staff',
      canAccessModule: Boolean(accessRows[0]?.staff_can_access),
    };
  });

  if (role !== 'admin' && role !== 'staff') {
    // Fail closed: a valid session token with no matching profile row must
    // never be routed as if it were an admin (previously defaulted to
    // 'admin' above, which was a privilege-escalation bug).
    if (path.startsWith('/staff-portal')) {
      return NextResponse.redirect(new URL('/staff-portal/login', request.url));
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (role === 'staff' && !staffAccountActive) {
    // Mirrors the original `supabase.auth.signOut()` on a deactivated staff
    // account mid-session: drop our own session cookie on the response.
    response.cookies.delete(SESSION_COOKIE);
  }

  if (role === 'staff' && staffAccountActive && !path.startsWith('/staff-portal')) {
    if (requestedModule && canAccessModule) return response;
    return NextResponse.redirect(new URL('/staff-portal', request.url));
  }
  if (
    role === 'staff' &&
    staffAccountActive &&
    (staffPortalKind === 'accounts' || staffPortalKind === 'manager') &&
    path.startsWith('/staff-portal/') &&
    path !== '/staff-portal/notifications'
  ) {
    return NextResponse.redirect(new URL('/staff-portal', request.url));
  }
  if (role === 'admin' && path.startsWith('/staff-portal')) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }
  if (path.startsWith('/staff-portal')) {
    if (role === 'staff' && !staffAccountActive && path !== '/staff-portal/login') {
      return NextResponse.redirect(new URL('/staff-portal/login', request.url));
    }
    if (role === 'staff' && staffAccountActive && path === '/staff-portal/login') {
      return NextResponse.redirect(new URL('/staff-portal', request.url));
    }
    return response;
  }
  if (path === '/login') return NextResponse.redirect(new URL('/dashboard', request.url));
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
