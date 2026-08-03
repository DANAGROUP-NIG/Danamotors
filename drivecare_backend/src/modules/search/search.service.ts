import prisma from '../../prisma/client';

const TAKE_PER_CATEGORY = 5;

export interface SearchResult {
  customers: { id: string; name: string; email: string }[];
  vehicles: { id: string; label: string; sublabel: string }[];
  jobCards: { id: string; label: string; sublabel: string }[];
  spareParts: { id: string; label: string; sublabel: string }[];
  users: { id: string; name: string; email: string }[];
}

const CATEGORY_PERMISSIONS: Record<keyof SearchResult, string> = {
  customers: 'customer:read',
  vehicles: 'vehicle:read',
  jobCards: 'service:read',
  spareParts: 'inventory:read',
  users: 'user:read',
};

export class SearchService {
  async search(query: string, permissions: string[]): Promise<SearchResult> {
    const q = query.trim();

    const allowed = (cat: keyof SearchResult) =>
      permissions.includes(CATEGORY_PERMISSIONS[cat]);

    const [customers, vehicles, jobCards, spareParts, users] = await Promise.all([
      allowed('customers') ? this.searchCustomers(q) : Promise.resolve([]),
      allowed('vehicles') ? this.searchVehicles(q) : Promise.resolve([]),
      allowed('jobCards') ? this.searchJobCards(q) : Promise.resolve([]),
      allowed('spareParts') ? this.searchSpareParts(q) : Promise.resolve([]),
      allowed('users') ? this.searchUsers(q) : Promise.resolve([]),
    ]);

    return { customers, vehicles, jobCards, spareParts, users };
  }

  private async searchCustomers(q: string) {
    const rows = await prisma.customer.findMany({
      where: {
        OR: [
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
        ],
      },
      take: TAKE_PER_CATEGORY,
    });

    return rows.map((c) => ({
      id: c.id,
      name: `${c.firstName} ${c.lastName}`,
      email: c.email,
    }));
  }

  private async searchVehicles(q: string) {
    const rows = await prisma.vehicle.findMany({
      where: {
        OR: [
          { vin: { contains: q, mode: 'insensitive' } },
          { registrationNumber: { contains: q, mode: 'insensitive' } },
          { make: { contains: q, mode: 'insensitive' } },
          { model: { contains: q, mode: 'insensitive' } },
          { color: { contains: q, mode: 'insensitive' } },
        ],
      },
      take: TAKE_PER_CATEGORY,
    });

    return rows.map((v) => ({
      id: v.id,
      label: `${v.make ?? ''} ${v.model ?? ''}`.trim() || 'Unknown Vehicle',
      sublabel: `VIN: ${v.vin}`,
    }));
  }

  private async searchJobCards(q: string) {
    const rows = await prisma.jobCard.findMany({
      where: {
        OR: [
          { jobNumber: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
        ],
      },
      take: TAKE_PER_CATEGORY,
    });

    return rows.map((j) => ({
      id: j.id,
      label: j.jobNumber,
      sublabel: j.description,
    }));
  }

  private async searchSpareParts(q: string) {
    const rows = await prisma.sparePart.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { partNumber: { contains: q, mode: 'insensitive' } },
          { category: { contains: q, mode: 'insensitive' } },
        ],
      },
      take: TAKE_PER_CATEGORY,
    });

    return rows.map((p) => ({
      id: p.id,
      label: p.name,
      sublabel: p.partNumber,
    }));
  }

  private async searchUsers(q: string) {
    const rows = await prisma.user.findMany({
      where: {
        OR: [
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
        ],
      },
      include: { role: true },
      take: TAKE_PER_CATEGORY,
    });

    return rows.map((u) => ({
      id: u.id,
      name: `${u.firstName} ${u.lastName}`,
      email: u.email,
    }));
  }
}
