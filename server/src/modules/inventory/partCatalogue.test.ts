import { preparePriceList } from './partCatalogue';

const categories = [
  { code: 'C', markupMultiplier: 3.33, isActive: true },
  { code: 'E', markupMultiplier: 2.5, isActive: true },
  { code: 'R', markupMultiplier: 5.58, isActive: false },
];

describe('preparePriceList', () => {
  it('derives the retail rate from the category unless the list gives one', () => {
    const { items, problems } = preparePriceList(
      [
        { partNumber: ' 473004g350 ', name: 'TRANSFER ASSY ', priceCategoryCode: 'e', dealerRate: 2731733.64 },
        { partNumber: 'K9934914250', name: 'HOSE-SUCTION', priceCategoryCode: 'C', dealerRate: 3639.636, retailRate: 12119.98788 },
        { partNumber: '96611P1000', name: 'HORN', dealerRate: 100 },
      ],
      categories,
    );
    expect(problems).toEqual([]);
    expect(items).toEqual([
      // Legacy FullpartList: 2731733.64 x 2.5 = 6829334.10
      { partNumber: '473004G350', name: 'TRANSFER ASSY', partFlag: 'O', priceCategoryCode: 'E', dealerRate: 2731733.64, retailRate: 6829334.1 },
      { partNumber: 'K9934914250', name: 'HOSE-SUCTION', partFlag: 'O', priceCategoryCode: 'C', dealerRate: 3639.636, retailRate: 12119.99 },
      { partNumber: '96611P1000', name: 'HORN', partFlag: 'O', priceCategoryCode: null, dealerRate: 100, retailRate: null },
    ]);
  });

  it('refuses the whole batch on duplicates, unknown or inactive categories', () => {
    const { items, problems } = preparePriceList(
      [
        { partNumber: 'A1', name: 'X', priceCategoryCode: 'C', dealerRate: 1 },
        { partNumber: 'a1', name: 'X', priceCategoryCode: 'C', dealerRate: 1 },
        { partNumber: 'B1', name: 'Y', priceCategoryCode: 'ZZ', dealerRate: 1 },
        { partNumber: 'C1', name: 'Z', priceCategoryCode: 'R', dealerRate: 1 },
      ],
      categories,
    );
    expect(items).toEqual([]);
    expect(problems).toEqual([
      'A1 appears more than once',
      'B1: unknown price category ZZ',
      'C1: price category R is inactive',
    ]);
  });
});
