import { Request, Response } from 'express';

jest.mock('../../prisma/client', () => ({ __esModule: true, default: {
  jobCard: { findUnique: jest.fn() }, branch: { findUnique: jest.fn() },
} }));
jest.mock('./service.service');
jest.mock('./labour.service');
jest.mock('../workshop/workshop.service');
jest.mock('../warranty/warrantyCase.service');
jest.mock('../warranty/warrantySettings.service');
jest.mock('../enquiry/enquiry.service');
jest.mock('../dashboard/dashboard.service');
jest.mock('../notification/notification.service');

import prisma from '../../prisma/client';
import { ServiceController } from './service.controller';
import { ServiceService } from './service.service';
import { WorkshopController } from '../workshop/workshop.controller';
import { WorkshopService } from '../workshop/workshop.service';
import { WarrantyController } from '../warranty/warranty.controller';
import { WarrantyCaseService } from '../warranty/warrantyCase.service';
import { PERMISSIONS, ROLES } from '../../shared/constants/roles';
import { EnquiryController } from '../enquiry/enquiry.controller';
import { EnquiryService } from '../enquiry/enquiry.service';
import { DashboardController } from '../dashboard/dashboard.controller';
import { DashboardService } from '../dashboard/dashboard.service';
import { NotificationController } from '../notification/notification.controller';
import { NotificationService } from '../notification/notification.service';

const request = (permissions: string[] = [], role: string = 'Custom', branchId: string | null = 'home') => ({
  user: { userId: 'staff', email: 'staff@example.test', role, permissions, branchId },
  params: { id: 'record' }, query: {}, body: {},
} as unknown as Request);
const response = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response);

beforeEach(() => jest.clearAllMocks());

it('uses the shared permission for enquiry, dashboard and notification branch bypasses', async () => {
  const cases = [
    [new EnquiryController().listEnquiries, EnquiryService.prototype.listEnquiries],
    [new NotificationController().list, NotificationService.prototype.list],
  ] as const;
  for (const [handler, service] of cases) {
    const mock = service as jest.Mock;
    mock.mockResolvedValue({});
    for (const permissions of [[], [PERMISSIONS.BRANCH_ALL]]) {
      await handler(request(permissions), response(), jest.fn());
      expect(mock).toHaveBeenLastCalledWith(expect.objectContaining({ branchId: permissions.length ? undefined : 'home' }));
    }
    const next = jest.fn();
    await handler(request([], 'Custom', null), response(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  }
  const dashboard = new DashboardController();
  const stats = DashboardService.prototype.getStats as jest.Mock;
  stats.mockResolvedValue({});
  await dashboard.getStats(request(), response(), jest.fn());
  expect(stats).toHaveBeenLastCalledWith('home', 'staff');
  const req = request();
  req.query.branchId = 'other';
  const next = jest.fn();
  await dashboard.getStats(req, response(), next);
  expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  req.user!.permissions = [PERMISSIONS.BRANCH_ALL];
  await dashboard.getStats(req, response(), jest.fn());
  expect(stats).toHaveBeenLastCalledWith('other', 'staff');
});

describe('service lists', () => {
  it.each(['listAppointments', 'listJobCards', 'listInspections', 'listEstimates'] as const)('%s enforces the shared branch permission', async method => {
    const controller = new ServiceController();
    const mock = ServiceService.prototype[method] as jest.Mock;
    mock.mockResolvedValue({});
    for (const [permissions, role, expected] of [
      [[], 'Custom', 'home'],
      [[PERMISSIONS.BRANCH_ALL], 'Custom', 'other'],
      [[], ROLES.SUPER_ADMIN, 'other'],
    ] as [string[], string, string][]) {
      const req = request(permissions, role);
      req.query.branchId = 'other';
      const next = jest.fn();
      await controller[method](req, response(), next);
      expect(next).not.toHaveBeenCalled();
      expect(mock).toHaveBeenLastCalledWith(expect.objectContaining({ branchId: expected }));
    }
    await controller[method](request([PERMISSIONS.BRANCH_ALL]), response(), jest.fn());
    expect(mock).toHaveBeenLastCalledWith(expect.objectContaining({ branchId: undefined }));
    mock.mockClear();
    const next = jest.fn();
    await controller[method](request([], 'Custom', null), response(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    expect(mock).not.toHaveBeenCalled();
  });
});

it('uses branch:all rather than role names when creating an appointment in another branch', async () => {
  (prisma.branch.findUnique as jest.Mock).mockResolvedValue({ name: 'Home branch' });
  const create = ServiceService.prototype.createAppointment as jest.Mock;
  create.mockResolvedValue({});
  const controller = new ServiceController();
  for (const [permissions, role, expected] of [
    [[], ROLES.CCU_MANAGER, 'Home branch'],
    [[PERMISSIONS.BRANCH_ALL], 'Custom', 'Other branch'],
    [[], ROLES.SUPER_ADMIN, 'Other branch'],
  ] as [string[], string, string][]) {
    const req = request(permissions, role);
    req.body = { branchName: 'Other branch' };
    const next = jest.fn();
    await controller.createAppointment(req, response(), next);
    expect(next).not.toHaveBeenCalled();
    expect(create).toHaveBeenLastCalledWith(expect.objectContaining({ branchName: expected }));
  }
});

it('scopes technician lists with the shared permission', async () => {
  const controller = new WorkshopController();
  const mock = WorkshopService.prototype.listTechnicians as jest.Mock;
  mock.mockResolvedValue({});
  for (const permissions of [[], [PERMISSIONS.BRANCH_ALL]]) {
    await controller.listTechnicians(request(permissions), response(), jest.fn());
    expect(mock).toHaveBeenLastCalledWith(expect.objectContaining({ branchId: permissions.length ? undefined : 'home' }));
  }
  const next = jest.fn();
  await controller.listTechnicians(request([], 'Custom', null), response(), next);
  expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
});

it('scopes warranty lists and rejects branchless users', async () => {
  const controller = new WarrantyController();
  const mock = WarrantyCaseService.prototype.list as jest.Mock;
  mock.mockResolvedValue({});
  for (const permissions of [[], [PERMISSIONS.BRANCH_ALL]]) {
    await controller.listCases(request(permissions), response(), jest.fn());
    expect(mock).toHaveBeenLastCalledWith(expect.objectContaining({ scopeBranchId: permissions.length ? undefined : 'home' }));
  }
  const next = jest.fn();
  await controller.listCases(request([], 'Custom', null), response(), next);
  expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
});

it.each(['getAppointment', 'getJobCard'] as const)('%s denies another branch by ID unless explicitly authorized', async method => {
  const controller = new ServiceController();
  (ServiceService.prototype[method] as jest.Mock).mockResolvedValue({ branchId: 'other' });
  for (const [permissions, role, allowed] of [[[], 'Custom', false], [[PERMISSIONS.BRANCH_ALL], 'Custom', true], [[], ROLES.SUPER_ADMIN, true]] as [string[], string, boolean][]) {
    const next = jest.fn();
    const res = response();
    await controller[method](request(permissions, role), res, next);
    if (allowed) expect(res.status).toHaveBeenCalledWith(200);
    else expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  }
});

it('guards workshop actions and warranty cases by ID', async () => {
  (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue({ branchId: 'other' });
  (WarrantyCaseService.prototype.get as jest.Mock).mockResolvedValue({ branchId: 'other' });
  const workshop = new WorkshopController();
  const warranty = new WarrantyController();
  for (const method of [workshop.assignTechnician, workshop.updateProgress, workshop.updateQC, warranty.getCase]) {
    for (const [permissions, role, allowed] of [[[], 'Custom', false], [[PERMISSIONS.BRANCH_ALL], 'Custom', true], [[], ROLES.SUPER_ADMIN, true]] as [string[], string, boolean][]) {
      const next = jest.fn();
      const res = response();
      await method(request(permissions, role), res, next);
      if (allowed) expect(res.status).toHaveBeenCalledWith(200);
      else expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    }
  }
});
