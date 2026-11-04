import { allowedJobTransitions, assertTransitionRole } from './job-transitions';
import { ROLES } from '../../shared/constants/roles';
it('reserves READY for the service advisor', () => {
  for (const role of Object.values(ROLES)) expect(allowedJobTransitions('QC', role).includes('READY')).toBe(role === ROLES.SERVICE_ADVISOR);
});
it('lets the assigned technician send to QC or wait and resume, rejecting other assignments', () => {
  for (const [from, to] of [['IN_PROGRESS', 'QC'], ['IN_PROGRESS', 'WAITING_PARTS'], ['WAITING_PARTS', 'IN_PROGRESS'], ['QC', 'IN_PROGRESS']]) {
    expect(() => assertTransitionRole(from, to, ROLES.TECHNICIAN, 'tech', 'tech')).not.toThrow();
    expect(() => assertTransitionRole(from, to, ROLES.TECHNICIAN, 'other', 'tech')).toThrow('assigned technician');
  }
  expect(allowedJobTransitions('DELIVERED', ROLES.ADMIN)).toEqual([]);
});
