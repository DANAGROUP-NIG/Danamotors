import { Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '../../prisma/client';
import { BadRequestError, ConflictError, NotFoundError } from '../../shared/errors/appError';
import { requireMaster } from '../workshop/workshop-master.service';
import { EmployeeInput, EmployeeUpdate, listEmployeeSchema } from './employee.validation';

const master = {
  select: {
    id: true,
    code: true,
    description: true,
  },
};

const include = {
  branch: {
    select: {
      id: true,
      name: true,
      code: true,
    },
  },
  designation: master,
  department: master,
  team: master,
  user: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
    },
  },
} satisfies Prisma.EmployeeInclude;

// Employees still working on a date: no left date, or leaving after it.
export function currentEmployeeWhere(at = new Date()): Prisma.EmployeeWhereInput {
  return {
    OR: [{
      leftDate: null,
    }, {
      leftDate: {
        gt: at,
      },
    }],
  };
}

export class EmployeeService {
  async list(query: z.infer<typeof listEmployeeSchema>['query'], branchId?: string) {
    const now = new Date();

    const where: Prisma.EmployeeWhereInput = {
      branchId,
      teamId: query.teamId,
      designationId: query.designationId,

      AND: [
        query.status === 'CURRENT' ? currentEmployeeWhere(now) : query.status === 'LEFT' ? {
          leftDate: {
            lte: now,
          },
        } : {},
        query.search ? {
          OR: ['code', 'name'].map(key => ({
            [key]: {
              contains: query.search,
              mode: 'insensitive',
            },
          })),
        } : {},
      ],
    };

    const [items, total] = await Promise.all([prisma.employee.findMany({
      where,
      include,

      orderBy: [{
        branchId: 'asc',
      }, {
        code: 'asc',
      }],

      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }), prisma.employee.count({
      where,
    })]);

    return {
      items,

      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async get(id: string) {
    const employee = await prisma.employee.findUnique({
      where: {
        id,
      },

      include,
    });

    if (!employee)
      throw new NotFoundError('Employee not found');

    return employee;
  }

  private async validateMasters(data: EmployeeUpdate) {
    if (data.designationId)
      await requireMaster(prisma, data.designationId, 'DESIGNATION');
    if (data.departmentId)
      await requireMaster(prisma, data.departmentId, 'DEPARTMENT');
    if (data.teamId)
      await requireMaster(prisma, data.teamId, 'TEAM');
  }

  private async save<T>(write: () => Promise<T>) {
    try {
      return await write();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const target = String(error.meta?.target ?? '');
        throw new ConflictError(target.includes('userId')
          ? 'That login is already linked to another employee'
          : 'An employee with this code already exists at the branch');
      }

      throw error;
    }
  }

  async create(data: EmployeeInput) {
    await this.validateMasters(data);

    return this.save(() => prisma.employee.create({
      data,
      include,
    }));
  }

  async update(id: string, data: EmployeeUpdate) {
    const existing = await this.get(id);
    const joinDate = data.joinDate === undefined ? existing.joinDate : data.joinDate;
    const leftDate = data.leftDate === undefined ? existing.leftDate : data.leftDate;
    if (joinDate && leftDate && leftDate < joinDate)
      throw new BadRequestError('Left date cannot be before the join date');
    await this.validateMasters(data);

    return this.save(() => prisma.employee.update({
      where: {
        id,
      },

      data,
      include,
    }));
  }
}
