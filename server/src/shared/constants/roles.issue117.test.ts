import { PERMISSIONS as P, ROLE_PERMISSIONS, ROLES as R } from './roles';
import { requirePermission } from '../../middleware/authorize';
const seedRoles = require('../../../prisma/seed/roles').default;
const actions = [P.JOBCARD_CREATE, P.JOBCARD_UPDATE, P.ASSIGNMENT_CREATE, P.JOBPROGRESS_UPDATE, P.QCSTATUS_UPDATE, P.JOBLABOUR_UPDATE, P.PARTISSUANCE_CREATE, P.ESTIMATE_CREATE, P.ESTIMATE_REVISE, P.ESTIMATE_PRINT, P.ESTIMATE_SIGN, P.JOB_BILL_CREATE];
const cases: [string, string[]][] = [
 [R.ADMIN, actions.filter(action => action !== P.JOB_BILL_CREATE)], [R.SUPER_ADMIN, actions],
 [R.SERVICE_MANAGER, [P.JOBCARD_CREATE,P.JOBLABOUR_UPDATE,P.ESTIMATE_REVISE,P.ESTIMATE_PRINT,P.ESTIMATE_SIGN]],
 [R.CCU_OFFICER, []], [R.CCU_MANAGER, []],
 [R.SERVICE_ADVISOR, [P.JOBCARD_CREATE,P.JOBCARD_UPDATE,P.JOBLABOUR_UPDATE,P.ESTIMATE_REVISE,P.ESTIMATE_PRINT,P.ESTIMATE_SIGN]],
 [R.WORKSHOP_MANAGER, [P.JOBCARD_CREATE,P.JOBCARD_UPDATE,P.ASSIGNMENT_CREATE,P.JOBPROGRESS_UPDATE,P.QCSTATUS_UPDATE,P.JOBLABOUR_UPDATE,P.ESTIMATE_CREATE,P.ESTIMATE_PRINT]],
 [R.GENERAL_STORE_MANAGER,[P.PARTISSUANCE_CREATE]], [R.BRANCH_STORE_MANAGER,[P.PARTISSUANCE_CREATE]],
 [R.BILLING_OFFICER,[P.JOB_BILL_CREATE]],
];
describe.each(cases)('%s API actions', (role, allowed) => {
 test.each(actions)('%s enforces permission', action => {
  const req = { user: { role, permissions: ROLE_PERMISSIONS[role as keyof typeof ROLE_PERMISSIONS] } };
  const invoke = () => requirePermission(action)(req as never, {} as never, jest.fn());
  if (allowed.includes(action)) expect(invoke).not.toThrow();
  else { try { invoke(); throw new Error('Expected forbidden'); } catch (error) { expect(error).toMatchObject({statusCode:403}); } }
 });
});
test('repeated seed reconstructs built-in permissions', async () => {
 const records = new Map<string, string[]>();
 const db = { permission: { upsert: jest.fn(), findMany: jest.fn(async ({where}) => where.name.in.map((name:string) => ({id:name}))) }, role: {upsert:jest.fn(async ({where})=>({id:where.name}))}, rolePermission: { deleteMany:jest.fn(async ({where})=> records.set(where.roleId,[])), createMany:jest.fn(async ({data})=>records.set(data[0].roleId,data.map((row:{permissionId:string})=>row.permissionId))) } };
 const log = jest.spyOn(console,'log').mockImplementation(()=>{});
 try { await seedRoles(db as never); const first = JSON.stringify([...records]); await seedRoles(db as never); expect(JSON.stringify([...records])).toBe(first); for(const [role] of cases) expect(records.get(role)).toEqual(ROLE_PERMISSIONS[role as keyof typeof ROLE_PERMISSIONS]); } finally { log.mockRestore(); }
});
