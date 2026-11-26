import { Request, Response } from "express";
import {
  assertBranchOwnership,
  assertInventoryBranchAccess,
  assertScopedResource,
  canAccessAllBranches,
  directoryBranchFilter,
  requiresOwnBranch,
  requirePermission,
} from "./authorize";
import {
  GENERAL_DEPARTMENT_ROLES,
  NEW_DEPARTMENT_ROLE_BASES,
  OWN_BRANCH_DEPARTMENT_ROLES,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  ROLES,
} from "../shared/constants/roles";

const request = (
  role: string,
  permissions: string[] = [],
  branchId: string | null = "home",
) =>
  ({
    user: {
      userId: "staff",
      email: "staff@example.test",
      role,
      permissions,
      branchId,
    },
  }) as Request;

describe("branch authorization", () => {
  it.each(Object.values(ROLES))(
    "%s follows permissions rather than its name",
    (role) => {
      const req = request(role);
      if (role === ROLES.SUPER_ADMIN || GENERAL_DEPARTMENT_ROLES.has(role)) {
        expect(() => assertBranchOwnership(req, "other")).not.toThrow();
      } else {
        expect(() => assertBranchOwnership(req, "other")).toThrow(
          expect.objectContaining({ statusCode: 403 }),
        );
      }
      req.user!.permissions = [PERMISSIONS.BRANCH_ALL];
      expect(canAccessAllBranches(req.user)).toBe(!requiresOwnBranch(req.user));
      if (requiresOwnBranch(req.user)) {
        expect(() => assertBranchOwnership(req, "other")).toThrow(
          expect.objectContaining({ statusCode: 403 }),
        );
      } else {
        expect(() => assertBranchOwnership(req, "other")).not.toThrow();
      }
    },
  );

  it.each([...OWN_BRANCH_DEPARTMENT_ROLES])(
    "%s is limited to home directory records",
    (role) => {
      const req = request(role, [PERMISSIONS.BRANCH_ALL]);
      req.query = {};
      expect(directoryBranchFilter(req)).toBe("home");
      expect(() => assertScopedResource(req, "home")).not.toThrow();
      expect(() => assertScopedResource(req, "other")).toThrow(
        expect.objectContaining({ statusCode: 403 }),
      );
      expect(() => assertScopedResource(req, null)).toThrow(
        expect.objectContaining({ statusCode: 403 }),
      );
      req.query = { branchId: "other" };
      expect(() => directoryBranchFilter(req)).toThrow(
        expect.objectContaining({ statusCode: 403 }),
      );
      req.user!.branchId = null;
      expect(() => directoryBranchFilter(req)).toThrow(
        expect.objectContaining({ statusCode: 403 }),
      );
    },
  );

  it.each([...GENERAL_DEPARTMENT_ROLES])(
    "%s can list and access records in either branch",
    (role) => {
      const req = request(role, [], null);
      req.query = {};
      expect(directoryBranchFilter(req)).toBeUndefined();
      for (const branchId of ["home", "other"]) {
        req.query = { branchId };
        expect(directoryBranchFilter(req)).toBe(branchId);
        expect(() => assertBranchOwnership(req, branchId)).not.toThrow();
        expect(() => assertScopedResource(req, branchId)).not.toThrow();
      }
    },
  );

  it("allows home records and rejects branchless or unauthenticated users", () => {
    expect(() =>
      assertBranchOwnership(request("Custom"), "home"),
    ).not.toThrow();
    expect(() =>
      assertBranchOwnership(request("Custom", [], null), "other"),
    ).toThrow(expect.objectContaining({ statusCode: 403 }));
    expect(() => assertBranchOwnership({} as Request, "other")).toThrow(
      expect.objectContaining({ statusCode: 401 }),
    );
    expect(canAccessAllBranches(undefined)).toBe(false);
  });

  it("keeps inventory access independent of branch:all and role names", () => {
    expect(() =>
      assertInventoryBranchAccess(
        request(ROLES.GENERAL_STORE_MANAGER, [PERMISSIONS.BRANCH_ALL]),
        ["other"],
      ),
    ).toThrow(expect.objectContaining({ statusCode: 403 }));
    expect(() =>
      assertInventoryBranchAccess(
        request("Custom", [PERMISSIONS.INVENTORY_CROSS_BRANCH]),
        ["other"],
      ),
    ).not.toThrow();
    expect(() =>
      assertInventoryBranchAccess(request(ROLES.SUPER_ADMIN), ["other"]),
    ).not.toThrow();
    expect(() =>
      assertInventoryBranchAccess(request(ROLES.BRANCH_STORE_MANAGER), [
        "home",
      ]),
    ).not.toThrow();
    expect(() =>
      assertInventoryBranchAccess(request(ROLES.BRANCH_STORE_MANAGER), [
        "other",
      ]),
    ).toThrow(expect.objectContaining({ statusCode: 403 }));
  });

  it("does not let branch:all bypass a module permission", () => {
    expect(() =>
      requirePermission(PERMISSIONS.JOBCARD_READ)(
        request("Custom", [PERMISSIONS.BRANCH_ALL]),
        {} as Response,
        jest.fn(),
      ),
    ).toThrow(expect.objectContaining({ statusCode: 403 }));
  });
});

describe("branch grants", () => {
  const granted = new Set([
    ROLES.SUPER_ADMIN,
    ROLES.SERVICE_MANAGER,
    ROLES.WARRANTY_OFFICER,
    ROLES.GENERAL_STORE_MANAGER,
    ...GENERAL_DEPARTMENT_ROLES,
  ]);
  it.each(Object.values(ROLES))(
    "%s has exactly the requested grants",
    (role) => {
      expect(ROLE_PERMISSIONS[role].includes(PERMISSIONS.BRANCH_ALL)).toBe(
        granted.has(role),
      );
      if (role !== ROLES.SUPER_ADMIN) {
        expect(
          ROLE_PERMISSIONS[role].includes(PERMISSIONS.INVENTORY_CROSS_BRANCH),
        ).toBe(role === ROLES.GENERAL_STORE_MANAGER);
      }
    },
  );

  it.each(Object.entries(NEW_DEPARTMENT_ROLE_BASES))(
    "%s inherits the department grants from %s",
    (role, base) => {
      expect(
        ROLE_PERMISSIONS[role as keyof typeof NEW_DEPARTMENT_ROLE_BASES].filter(
          (permission) => permission !== PERMISSIONS.BRANCH_ALL,
        ),
      ).toEqual(ROLE_PERMISSIONS[base]);
    },
  );
});
