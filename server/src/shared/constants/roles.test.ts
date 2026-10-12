import { PERMISSIONS, ROLE_PERMISSIONS, ROLES } from './roles';

describe('Parts Reports grants', () => {
  it.each([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.ACCOUNTANT])('grants %s the dedicated permission', role => {
    expect(ROLE_PERMISSIONS[role]).toContain(PERMISSIONS.PARTS_REPORT_READ);
  });

  it.each([ROLES.GENERAL_STORE_MANAGER, ROLES.BRANCH_STORE_MANAGER])('denies %s the dedicated permission', role => {
    expect(ROLE_PERMISSIONS[role]).not.toContain(PERMISSIONS.PARTS_REPORT_READ);
  });
});
