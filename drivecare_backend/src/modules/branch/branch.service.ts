import { BranchRepository } from './branch.repository';
import { NotFoundError, ConflictError } from '../../shared/errors/appError';

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
  }) {
    const existingBranch = await this.branchRepository.findBranchByName(data.name);
    if (existingBranch) {
      throw new ConflictError('A branch with this name already exists');
    }

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
  }) {
    const branch = await this.branchRepository.findBranchById(id);
    if (!branch) {
      throw new NotFoundError('Branch not found');
    }

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
      isActive: updatedBranch.isActive,
      createdAt: updatedBranch.createdAt,
      updatedAt: updatedBranch.updatedAt,
    };
  }

  async deleteBranch(id: string) {
    const branch = await this.branchRepository.findBranchById(id);
    if (!branch) {
      throw new NotFoundError('Branch not found');
    }

    await this.branchRepository.deleteBranch(id);

    return {
      id: branch.id,
      name: branch.name,
    };
  }
}
