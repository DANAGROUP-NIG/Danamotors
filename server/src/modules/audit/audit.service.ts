import { AuditRepository } from './audit.repository';
import { NotFoundError } from '../../shared/errors/appError';

export class AuditService {
  private auditRepository: AuditRepository;

  constructor() {
    this.auditRepository = new AuditRepository();
  }

  async listLogs(params: {
    page: number;
    limit: number;
    userId?: string;
    action?: string;
    search?: string;
    dateFrom?: Date;
    dateTo?: Date;
    branchId?: string;
  }) {
    const skip = (params.page - 1) * params.limit;
    const { logs, total } = await this.auditRepository.listLogs({
      skip,
      take: params.limit,
      userId: params.userId,
      action: params.action,
      search: params.search,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      branchId: params.branchId,
    });

    return {
      logs,
      meta: {
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.ceil(total / params.limit),
      },
    };
  }

  async getLog(id: string) {
    const log = await this.auditRepository.findLogById(id);
    if (!log) {
      throw new NotFoundError('Audit log not found');
    }
    return log;
  }

  async getStats(branchId?: string) {
    return this.auditRepository.getStats(branchId);
  }
}

export default AuditService;
