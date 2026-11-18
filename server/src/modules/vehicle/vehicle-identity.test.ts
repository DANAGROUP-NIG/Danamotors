jest.mock('../../prisma/client', () => ({ __esModule: true, default: {} }));

import { assertCanChangeIdentity, identityChanges } from './vehicle-identity';
import { PERMISSIONS, ROLES } from '../../shared/constants/roles';

const vehicle = {
  vin: 'KNARH81DDR5301467',
  registrationNumber: 'ABC123XY',
  engineNumber: 'G4FG12345',
  saleDate: new Date('2024-03-15T00:00:00Z'),
  year: 2024,
  modelId: 'model-1',
  keyNumber: 'K1',
};

describe('Vehicle identity changes', () => {
  it('ignores fields sent unchanged, including a re-sent date and blank vs null', () => {
    expect(identityChanges(vehicle, {
      vin: 'knarh81ddr5301467', registrationNumber: 'ABC123XY', saleDate: '2024-03-15T00:00:00.000Z', year: 2024, customModel: '', keyNumber: 'K2',
    })).toEqual({});
  });

  it('lists each identity field that changes, never ordinary ones', () => {
    expect(identityChanges(vehicle, { vin: 'KNARH81DDR5301468', saleDate: '2024-03-16T00:00:00.000Z', engineNumber: null, keyNumber: 'K2' })).toEqual({
      vin: { from: 'KNARH81DDR5301467', to: 'KNARH81DDR5301468' },
      saleDate: { from: '2024-03-15', to: '2024-03-16' },
      engineNumber: { from: 'G4FG12345', to: null },
    });
  });
});

describe('Who may change a vehicle identity', () => {
  const change = { registrationNumber: { from: 'ABC123XY', to: 'XYZ987AB' } };

  it('needs the permission', () => {
    expect(() => assertCanChangeIdentity({ userId: 'u', role: ROLES.SERVICE_ADVISOR, permissions: [PERMISSIONS.VEHICLE_UPDATE] }, change, 'Wrong plate'))
      .toThrow('needs the vehicle identity permission');
  });

  it('needs a reason', () => {
    expect(() => assertCanChangeIdentity({ userId: 'u', role: ROLES.ADMIN, permissions: [PERMISSIONS.VEHICLE_IDENTITY_UPDATE] }, change, ' '))
      .toThrow('Give a reason');
  });

  it('passes with both, and a super admin needs only the reason', () => {
    expect(() => assertCanChangeIdentity({ userId: 'u', role: ROLES.ADMIN, permissions: [PERMISSIONS.VEHICLE_IDENTITY_UPDATE] }, change, 'Plate re-issued')).not.toThrow();
    expect(() => assertCanChangeIdentity({ userId: 'u', role: ROLES.SUPER_ADMIN }, change, 'Plate re-issued')).not.toThrow();
  });

  it('asks nothing when no identity field changes', () => {
    expect(() => assertCanChangeIdentity({ userId: 'u', role: ROLES.TECHNICIAN }, {}, undefined)).not.toThrow();
  });
});
