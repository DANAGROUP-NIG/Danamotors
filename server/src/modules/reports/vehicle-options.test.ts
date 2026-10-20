import { vehicleOptionsQuery } from './vehicle-options';
describe('Report vehicle search validation', () => {
    it('accepts an omitted search and bounded keyset paging', () => {
        expect(vehicleOptionsQuery.parse({})).toEqual({ q: '', limit: 25 });
        expect(vehicleOptionsQuery.safeParse({ limit: 1001 }).success).toBe(false);
        expect(vehicleOptionsQuery.safeParse({ cursor: 'invalid' }).success).toBe(false);
        expect(vehicleOptionsQuery.safeParse({ q: 'a'.repeat(101) }).success).toBe(false);
        expect(vehicleOptionsQuery.safeParse({ selectedIds: 'foreign-or-invalid' }).success).toBe(false);
    });
});
