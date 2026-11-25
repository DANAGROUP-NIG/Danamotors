jest.mock('../../prisma/client', () => ({
  __esModule: true,
  default: { permission: { findMany: jest.fn() } },
}));

import prisma from '../../prisma/client';
import { AdminService } from './admin.service';
import { PERMISSIONS } from '../../shared/constants/roles';

it('lists all eight assignable CSI actions in one group and preserves other report groups', async () => {
  const names = [
    ...Object.entries(PERMISSIONS)
      .filter(([key]) => key.startsWith('CSI_'))
      .map(([, name]) => name),
    'report:delayed-deliveries',
    'customer:read',
  ];
  const permissions = names.map((name) => ({
    id: `permission-${name}`,
    name,
    description: name,
    createdAt: new Date('2026-11-24T00:00:00Z'),
  }));
  jest.mocked(prisma.permission.findMany).mockResolvedValue(permissions);

  const result = await new AdminService().getPermissions();
  const csi = result.groups.find((group) => group.module === 'Customer satisfaction (CSI)');
  expect(csi?.permissions).toHaveLength(8);
  expect(csi?.permissions.map((permission) => permission.name)).toEqual(names.slice(0, 8));
  expect(result.groups.find((group) => group.module === 'Reports')?.permissions)
    .toEqual([expect.objectContaining({ name: 'report:delayed-deliveries' })]);
  expect(result.permissions).toHaveLength(10);
  expect(csi?.permissions[0].id).toBe(`permission-${names[0]}`);
});
