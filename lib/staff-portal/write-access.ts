import 'server-only';

import type { AccessModule } from './access-modules';
import { isAccountsPortalReadOnlyModule } from './access-modules';
import { getStaffSession } from './session';

export async function assertStaffPortalWriteAccess(module: AccessModule) {
  const session = await getStaffSession();
  if (
    session?.portalKind === 'accounts' &&
    isAccountsPortalReadOnlyModule(module)
  ) {
    throw new Error(`This Accounts Portal has view-only access to ${module}.`);
  }
}
