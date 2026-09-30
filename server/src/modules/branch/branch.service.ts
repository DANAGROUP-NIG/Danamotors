import { BranchRepository } from './branch.repository';
import { NotFoundError, ConflictError, BadRequestError } from '../../shared/errors/appError';

export class BranchService {
  private branchRepository: BranchRepository;

  constructor() {
    this.branchRepository = new BranchRepository();
  }

  async listBranches(params: { page: number; limit: number; search?: string }) {
    const skip = (params.page - 1) * params.limit;
    const { branches, total } = await this.branchRepository.listBranches({
      skip,
      take: params.limit,
      search: params.search,
    });

    return {
      branches: branches.map((branch) => ({
        id: branch.id,
        name: branch.name,
        address: branch.address,
        city: branch.city,
        state: branch.state,
        country: branch.country,
        phoneNumber: branch.phoneNumber,
        email: branch.email,
        code: branch.code,
        parentBranchId: branch.parentBranchId,
        parentBranch: branch.parentBranch,
        isActive: branch.isActive,
        usersCount: branch._count.users,
        createdAt: branch.createdAt,
        updatedAt: branch.updatedAt,
      })),
      meta: {
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.ceil(total / params.limit),
      },
    };
  }

  async getBranch(id: string) {
    const branch = await this.branchRepository.findBranchById(id);
    if (!branch) {
      throw new NotFoundError('Branch not found');
    }

    return {
      id: branch.id,
      name: branch.name,
      address: branch.address,
      city: branch.city,
      state: branch.state,
      country: branch.country,
      phoneNumber: branch.phoneNumber,
      email: branch.email,
      code: branch.code,
      parentBranchId: branch.parentBranchId,
      parentBranch: branch.parentBranch,
      subLocations: branch.subLocations,
      isActive: branch.isActive,
      usersCount: branch._count.users,
      jobCardsCount: branch._count.jobCards,
      appointmentsCount: branch._count.appointments,
      createdAt: branch.createdAt,
      updatedAt: branch.updatedAt,
    };
  }

  async createBranch(data: {
    name: string;
    address?: string;
    city?: string;
    state?: string;
    country?: string;
    phoneNumber?: string;
    email?: string;
    code?: string;
    parentBranchId?: string;
  }) {
    const existingBranch = await this.branchRepository.findBranchByName(data.name);
    if (existingBranch) {
      throw new ConflictError('A branch with this name already exists');
    }
    await this.assertCodeFree(data.code);
    await this.assertValidParent(null, data.parentBranchId);

    const branch = await this.branchRepository.createBranch(data);

    return {
      id: branch.id,
      name: branch.name,
      address: branch.address,
      city: branch.city,
      state: branch.state,
      country: branch.country,
      phoneNumber: branch.phoneNumber,
      email: branch.email,
      code: branch.code,
      parentBranchId: branch.parentBranchId,
      isActive: branch.isActive,
      createdAt: branch.createdAt,
      updatedAt: branch.updatedAt,
    };
  }

  async updateBranch(id: string, data: {
    name?: string;
    address?: string;
    city?: string;
    state?: string;
    country?: string;
    phoneNumber?: string;
    email?: string;
    code?: string | null;
    parentBranchId?: string | null;
  }) {
    const branch = await this.branchRepository.findBranchById(id);
    if (!branch) {
      throw new NotFoundError('Branch not found');
    }
    if (data.code && data.code !== branch.code) await this.assertCodeFree(data.code);
    if (data.parentBranchId !== undefined) await this.assertValidParent(id, data.parentBranchId);

    if (data.name && data.name !== branch.name) {
      const existingBranch = await this.branchRepository.findBranchByName(data.name);
      if (existingBranch) {
        throw new ConflictError('A branch with this name already exists');
      }
    }

    const updatedBranch = await this.branchRepository.updateBranch(id, data);

    return {
      id: updatedBranch.id,
      name: updatedBranch.name,
      address: updatedBranch.address,
      city: updatedBranch.city,
      state: updatedBranch.state,
      country: updatedBranch.country,
      phoneNumber: updatedBranch.phoneNumber,
      email: updatedBranch.email,
      code: updatedBranch.code,
      parentBranchId: updatedBranch.parentBranchId,
      isActive: updatedBranch.isActive,
      createdAt: updatedBranch.createdAt,
      updatedAt: updatedBranch.updatedAt,
    };
  }

  private async assertCodeFree(code?: string | null) {
    if (!code) return;
    const existing = await this.branchRepository.findBranchByCode(code);
    if (existing) throw new ConflictError(`Branch code ${code} is already used by ${existing.name}`);
  }

  /**
   * A sub-location (store or godown at another branch's premises) may only sit
   * one level deep: its parent must be a top-level branch, and a branch that
   * already has sub-locations cannot become one itself.
   */
  private async assertValidParent(branchId: string | null, parentBranchId?: string | null) {
    if (!parentBranchId) return;
    if (branchId && parentBranchId === branchId) {
      throw new BadRequestError('A branch cannot be a sub-location of itself');
    }
    const parent = await this.branchRepository.findBranchById(parentBranchId);
    if (!parent) throw new NotFoundError('Parent branch not found');
    if (parent.parentBranchId) {
      throw new BadRequestError(`${parent.name} is itself a sub-location; choose its main branch instead`);
    }
    if (branchId && (await this.branchRepository.countSubLocations(branchId)) > 0) {
      throw new BadRequestError('This branch has its own sub-locations, so it cannot become a sub-location');
    }
  }

  async deleteBranch(id: string) {
    const branch = await this.branchRepository.findBranchById(id);
    if (!branch) {
      throw new NotFoundError('Branch not found');
    }

    const deleted = await this.branchRepository.deleteBranch(id);

    return {
      id: deleted.id,
      name: deleted.name,
    };
  }
}
