import prisma from "../../prisma/client";
import { listRequisitionPartOptions } from "./requisition-part-options.service";

jest.mock("../../prisma/client", () => ({
  __esModule: true,
  default: {
    sparePart: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() },
  },
}));
const actor = {
  userId: "actor",
  branchId: "branch",
  allBranches: false,
  goodwill: false,
};
const query = {
  partId: "requested",
  branchId: "branch",
  page: 2,
  limit: 10,
  source: "R" as const,
  search: "pump",
};
beforeEach(() => jest.clearAllMocks());
it("denies cross-branch reads before querying the catalogue", async () => {
  await expect(
    listRequisitionPartOptions({ ...query, branchId: "other" }, actor),
  ).rejects.toThrow("your branch");
  expect(prisma.sparePart.findUnique).not.toHaveBeenCalled();
});
it("lists active family records including missing stock and excludes reservations", async () => {
  const base = {
    id: "requested",
    partNumber: "P1",
    name: "Pump",
    partFlag: "R",
    partStatus: "ACTIVE",
    mainPartId: null,
    sourceOfPartId: "main",
    retailRate: null,
    warrantyRate: 0,
    unitPrice: 50.12,
    warrantyApplicable: true,
  };
  (prisma.sparePart.findUnique as jest.Mock).mockResolvedValue(base);
  (prisma.sparePart.findMany as jest.Mock).mockResolvedValue([
    { ...base, inventoryStocks: [] },
    {
      ...base,
      id: "alternate",
      mainPartId: "main",
      sourceOfPartId: null,
      inventoryStocks: [{ quantity: 7, reservedQuantity: 5 }],
    },
  ]);
  (prisma.sparePart.count as jest.Mock).mockResolvedValue(12);
  const result = await listRequisitionPartOptions(query, actor);
  expect(result.options).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: "requested",
        available: 0,
        normalRate: 50.12,
        warrantyRate: 0,
        relationship: "requested",
      }),
      expect.objectContaining({
        id: "alternate",
        available: 2,
        relationship: "alternate",
      }),
    ]),
  );
  expect(result.meta).toEqual({ page: 2, limit: 10, total: 12, totalPages: 2 });
  expect(prisma.sparePart.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      skip: 10,
      take: 10,
      where: expect.objectContaining({
        partStatus: "ACTIVE",
        partFlag: "R",
        AND: expect.arrayContaining([
          {
            OR: [
              { id: "main" },
              { mainPartId: "main" },
              { sourceOfPartId: "main" },
            ],
          },
        ]),
      }),
      include: { inventoryStocks: { where: { branchId: "branch" } } },
    }),
  );
});
