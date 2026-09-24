import { InventoryService } from './inventory.service';
import { InventoryRepository } from './inventory.repository';
import { ConflictError, NotFoundError } from '../../shared/errors/appError';
import { PartRole, PartStatus, SparePart } from '@prisma/client';

const mockSparePart = (overrides: Partial<SparePart> = {}): SparePart => ({
  id: '550e8400-e29b-41d4-a716-446655440000',
  partCode: 'TYT-OIL-5W30',
  partNumber: 'ENG-OIL-5W30',
  name: 'Toyota 5W-30 Engine Oil (4L)',
  description: null,
  category: 'Lubricants',
  uom: 'Litre',
  taxCategory: null,
  taxForm: null,
  minLevel: null,
  maxLevel: null,
  reorderQty: null,
  unitPrice: 4500,
  binLocation: null,
  storeLocation: null,
  role: PartRole.MAIN,
  mainPartId: null,
  partStatus: PartStatus.ACTIVE,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
});

describe('InventoryService - Part Master', () => {
  let service: InventoryService;

  beforeEach(() => {
    service = new InventoryService();
    jest.clearAllMocks();
  });

  describe('createPart', () => {
    it('should create a part with all required fields', async () => {
      const createPartSpy = jest
        .spyOn(InventoryRepository.prototype, 'createPart')
        .mockResolvedValue(mockSparePart());
      jest.spyOn(InventoryRepository.prototype, 'findPartByCode').mockResolvedValue(null);

      const result = await service.createPart({
        partCode: 'TYT-OIL-5W30',
        partNumber: 'ENG-OIL-5W30',
        name: 'Toyota 5W-30 Engine Oil (4L)',
        category: 'Lubricants',
        uom: 'Litre',
        unitRate: 4500,
      });

      expect(createPartSpy).toHaveBeenCalledWith({
        partCode: 'TYT-OIL-5W30',
        partNumber: 'ENG-OIL-5W30',
        name: 'Toyota 5W-30 Engine Oil (4L)',
        category: 'Lubricants',
        uom: 'Litre',
        unitPrice: 4500,
      });
      expect(result.unitRate).toBe(4500);
      expect(result).not.toHaveProperty('unitPrice');
    });

    it('should throw conflict error for duplicate partCode', async () => {
      jest
        .spyOn(InventoryRepository.prototype, 'findPartByCode')
        .mockResolvedValue(mockSparePart({ partCode: 'TYT-OIL-5W30' }));

      await expect(
        service.createPart({
          partCode: 'TYT-OIL-5W30',
          partNumber: 'ENG-OIL-10W40',
          name: 'Engine Oil 10W-40 (4L)',
          category: 'Lubricants',
          uom: 'Litre',
          unitRate: 7500,
        }),
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('getAllParts', () => {
    it('should return paginated parts filtered by status', async () => {
      const parts = [mockSparePart(), mockSparePart({ id: '660e8400-e29b-41d4-a716-446655440001' })];
      jest.spyOn(InventoryRepository.prototype, 'findAllParts').mockResolvedValue({
        parts,
        total: 2,
      });

      const result = await service.getAllParts({
        partStatus: PartStatus.ACTIVE,
        page: 1,
        limit: 20,
      });

      expect(result.parts).toHaveLength(2);
      expect(result.meta.total).toBe(2);
      expect(result.parts[0].partStatus).toBe(PartStatus.ACTIVE);
    });
  });

  describe('getPartById', () => {
    it('should return a part by id', async () => {
      jest
        .spyOn(InventoryRepository.prototype, 'findPartById')
        .mockResolvedValue(mockSparePart());

      const result = await service.getPartById('550e8400-e29b-41d4-a716-446655440000');

      expect(result.id).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(result.unitRate).toBe(4500);
    });

    it('should throw not found error when part does not exist', async () => {
      jest.spyOn(InventoryRepository.prototype, 'findPartById').mockResolvedValue(null);

      await expect(
        service.getPartById('00000000-0000-0000-0000-000000000000'),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('updatePart', () => {
    it('should update a part successfully', async () => {
      jest
        .spyOn(InventoryRepository.prototype, 'findPartById')
        .mockResolvedValue(mockSparePart());
      jest.spyOn(InventoryRepository.prototype, 'findPartByCode').mockResolvedValue(null);
      jest
        .spyOn(InventoryRepository.prototype, 'updatePart')
        .mockResolvedValue(mockSparePart({ name: 'Updated name', unitPrice: 4600 }));

      const result = await service.updatePart('550e8400-e29b-41d4-a716-446655440000', {
        name: 'Updated name',
        unitRate: 4600,
      });

      expect(result.name).toBe('Updated name');
      expect(result.unitRate).toBe(4600);
    });

    it('should throw not found error when part does not exist', async () => {
      jest.spyOn(InventoryRepository.prototype, 'findPartById').mockResolvedValue(null);

      await expect(
        service.updatePart('00000000-0000-0000-0000-000000000000', { name: 'Updated name' }),
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw conflict error when updating to a duplicate partCode', async () => {
      jest
        .spyOn(InventoryRepository.prototype, 'findPartById')
        .mockResolvedValue(mockSparePart({ partCode: 'OLD-CODE' }));
      jest
        .spyOn(InventoryRepository.prototype, 'findPartByCode')
        .mockResolvedValue(mockSparePart({ id: 'other-id', partCode: 'NEW-CODE' }));

      await expect(
        service.updatePart('550e8400-e29b-41d4-a716-446655440000', { partCode: 'NEW-CODE' }),
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('deletePart', () => {
    it('should delete a part successfully', async () => {
      jest
        .spyOn(InventoryRepository.prototype, 'findPartById')
        .mockResolvedValue(mockSparePart());
      jest.spyOn(InventoryRepository.prototype, 'deletePart').mockResolvedValue(mockSparePart());

      const result = await service.deletePart('550e8400-e29b-41d4-a716-446655440000');

      expect(result.message).toBe('Part deleted successfully');
    });

    it('should throw not found error when part does not exist', async () => {
      jest.spyOn(InventoryRepository.prototype, 'findPartById').mockResolvedValue(null);

      await expect(
        service.deletePart('00000000-0000-0000-0000-000000000000'),
      ).rejects.toThrow(NotFoundError);
    });
  });
});
