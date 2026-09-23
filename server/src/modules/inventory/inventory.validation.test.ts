import {
  createPartMasterSchema,
  updatePartMasterSchema,
  listPartsQuerySchema,
} from './inventory.validation';

const validCreateInput = {
  partCode: 'TYT-OIL-5W30',
  partNumber: 'ENG-OIL-5W30',
  name: 'Toyota 5W-30 Engine Oil (4L)',
  category: 'Lubricants',
  uom: 'Litre',
  unitRate: 4500,
};

describe('createPartMasterSchema', () => {
  it('should accept valid input with all required fields', async () => {
    const result = await createPartMasterSchema.parseAsync({
      body: validCreateInput,
      query: {},
      params: {},
    });
    expect(result.body).toMatchObject(validCreateInput);
  });

  it('should reject invalid partStatus values', async () => {
    await expect(
      createPartMasterSchema.parseAsync({
        body: { ...validCreateInput, partStatus: 'INVALID' },
        query: {},
        params: {},
      }),
    ).rejects.toThrow();
  });

  it('should reject negative unitRate', async () => {
    await expect(
      createPartMasterSchema.parseAsync({
        body: { ...validCreateInput, unitRate: -1 },
        query: {},
        params: {},
      }),
    ).rejects.toThrow('Unit rate must be greater than zero');
  });

  it('should reject missing required fields', async () => {
    const { partCode, ...missingCode } = validCreateInput;
    await expect(
      createPartMasterSchema.parseAsync({
        body: missingCode,
        query: {},
        params: {},
      }),
    ).rejects.toThrow();
  });

  it('should reject maxLevel less than minLevel', async () => {
    await expect(
      createPartMasterSchema.parseAsync({
        body: { ...validCreateInput, minLevel: 10, maxLevel: 5 },
        query: {},
        params: {},
      }),
    ).rejects.toThrow('Maximum level must be greater than or equal to minimum level');
  });

  it('should accept optional fields', async () => {
    const input = {
      ...validCreateInput,
      taxCategory: 'VAT',
      taxForm: 'Form C',
      minLevel: 10,
      maxLevel: 100,
      reorderQty: 50,
      binLocation: 'A-12-3',
      storeLocation: 'Main Warehouse',
      partStatus: 'ACTIVE' as const,
    };
    const result = await createPartMasterSchema.parseAsync({
      body: input,
      query: {},
      params: {},
    });
    expect(result.body).toMatchObject(input);
  });
});

describe('updatePartMasterSchema', () => {
  it('should accept partial updates', async () => {
    const result = await updatePartMasterSchema.parseAsync({
      body: { name: 'Updated name' },
      query: {},
      params: { id: '550e8400-e29b-41d4-a716-446655440000' },
    });
    expect(result.body).toEqual({ name: 'Updated name' });
  });

  it('should enforce min/max level cross-field rule on update', async () => {
    await expect(
      updatePartMasterSchema.parseAsync({
        body: { minLevel: 10, maxLevel: 5 },
        query: {},
        params: { id: '550e8400-e29b-41d4-a716-446655440000' },
      }),
    ).rejects.toThrow('Maximum level must be greater than or equal to minimum level');
  });
});

describe('listPartsQuerySchema', () => {
  it('should accept valid query parameters', async () => {
    const result = await listPartsQuerySchema.parseAsync({
      body: {},
      query: {
        partStatus: 'ACTIVE',
        page: '2',
        limit: '50',
      },
      params: {},
    });
    expect(result.query).toMatchObject({
      partStatus: 'ACTIVE',
      page: 2,
      limit: 50,
    });
  });

  it('should reject invalid partStatus query', async () => {
    await expect(
      listPartsQuerySchema.parseAsync({
        body: {},
        query: { partStatus: 'UNKNOWN' },
        params: {},
      }),
    ).rejects.toThrow();
  });
});
