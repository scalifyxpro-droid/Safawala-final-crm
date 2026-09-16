import { redirect } from 'next/navigation';
import type { StaffDepartment } from './constants';
import { MODULE_DEPARTMENT, type StaffModule } from './modules';
import { getStaffSession, hasActiveDepartment, hasModule } from './session';
import type { StaffSession } from './types';

export async function requireStaffSession(): Promise<StaffSession> {
  const session = await getStaffSession();
  if (!session) redirect('/staff-portal/login');
  return session;
}

export async function requireDepartment(department: StaffDepartment): Promise<StaffSession> {
  const session = await requireStaffSession();
  if (!hasActiveDepartment(session, department)) {
    redirect(`/staff-portal?denied=${department}`);
  }
  return session;
}

export async function requireStylistSession(): Promise<StaffSession> {
  const session = await requireDepartment('stylist');
  // A Stylist Main ID is intentionally a regular staff record with main
  // access and the Stylist department. Personal stylist IDs use the dedicated
  // `stylist` staff type. Both are valid; rejecting the main ID here made the
  // Stylist dashboard redirect back with `?denied=stylist` even though the
  // account held the correct active department grant.
  if (!session.isMainId && session.staffType !== 'stylist') {
    redirect('/staff-portal?denied=stylist');
  }
  return session;
}

export async function requirePermission(permission: StaffModule): Promise<StaffSession> {
  const session = await requireStaffSession();
  const department = MODULE_DEPARTMENT[permission];
  if ((department && !hasActiveDepartment(session, department)) || !hasModule(session, permission)) {
    redirect('/staff-portal?denied=department');
  }
  return session;
}
