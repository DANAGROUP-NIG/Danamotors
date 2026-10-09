jest.mock('../../prisma/client', () => ({ __esModule: true, default: {
  jobCard: { count: jest.fn(), groupBy: jest.fn() },
  payment: { aggregate: jest.fn() },
  invoice: { count: jest.fn(), aggregate: jest.fn() },
  serviceAppointment: { count: jest.fn(), findMany: jest.fn(), groupBy: jest.fn() },
  role: { findUnique: jest.fn() }, user: { count: jest.fn() }, $queryRaw: jest.fn(),
} }));
import prisma from '../../prisma/client';
import { DashboardService } from './dashboard.service';

beforeEach(() => {
  jest.clearAllMocks();
  (prisma.jobCard.count as jest.Mock).mockResolvedValue(0);
  (prisma.jobCard.groupBy as jest.Mock).mockResolvedValue([]);
  (prisma.payment.aggregate as jest.Mock).mockResolvedValue({ _sum: { amount: 0 } });
  (prisma.invoice.count as jest.Mock).mockResolvedValue(0);
  (prisma.invoice.aggregate as jest.Mock).mockResolvedValue({ _sum: { outstandingAmount: 25, total: 100 } });
  (prisma.serviceAppointment.count as jest.Mock).mockResolvedValue(0);
  (prisma.serviceAppointment.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.serviceAppointment.groupBy as jest.Mock).mockResolvedValue([]);
  (prisma.role.findUnique as jest.Mock).mockResolvedValue(null);
  (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);
});

it('reports remaining outstanding, including overdue invoices, instead of full bill totals', async () => {
  const result = await new DashboardService().getStats();
  expect(result.totalOutstanding).toBe(25);
  expect(prisma.invoice.aggregate).toHaveBeenCalledWith({
    where: { status: { notIn: ['Cancelled', 'CANCELLED', 'CANCELED', 'VOID'] } },
    _sum: { outstandingAmount: true },
  });
});

it('scopes both job bills and standalone customer invoices to the selected branch', async () => {
  await new DashboardService().getStats('branch');
  expect(prisma.invoice.aggregate).toHaveBeenCalledWith({
    where: { status: { notIn: ['Cancelled', 'CANCELLED', 'CANCELED', 'VOID'] }, OR: [{ jobCard: { branchId: 'branch' } }, { jobCardId: null, customer: { branchId: 'branch' } }] },
    _sum: { outstandingAmount: true },
  });
});

it('returns zero when there are no outstanding invoices', async () => {
  (prisma.invoice.aggregate as jest.Mock).mockResolvedValue({ _sum: { outstandingAmount: null } });
  expect((await new DashboardService().getStats()).totalOutstanding).toBe(0);
});
