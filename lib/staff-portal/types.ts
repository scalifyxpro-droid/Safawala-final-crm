import type { StaffDepartment } from './constants';
import type { StaffModule } from './modules';
import type { AccessModule } from './access-modules';

export type StaffAccessType = 'main' | 'staff';

export type StaffType = 'regular' | 'stylist';

export type StaffPortalKind = 'staff' | 'accounts' | 'manager';

export type StaffPortalRole = 'staff' | 'lead';

export type StaffDepartmentGrant = {
  department: StaffDepartment;
  active: boolean;
  role: StaffPortalRole;
};

export type StaffPortalAccount = {
  id: string;
  staffMemberId: number | null;
  name: string;
  loginId: string;
  active: boolean;
  accessType: StaffAccessType;
  staffType: StaffType;
  portalKind: StaffPortalKind;
  modules: AccessModule[];
  departments: StaffDepartmentGrant[];
  createdAt: string;
  updatedAt: string;
};

export type StaffSession = {
  id: string;
  languagePreference: 'en' | 'hi' | 'gu';
  staffMemberId: number;
  name: string;
  loginId: string;
  departments: StaffDepartmentGrant[];
  permissions: StaffModule[];
  accessType: StaffAccessType;
  staffType: StaffType;
  portalKind: StaffPortalKind;
  accessModules: AccessModule[];
  isMainId: boolean;
  managedDepartment: StaffDepartment | null;
  mainId: string | null;
};
