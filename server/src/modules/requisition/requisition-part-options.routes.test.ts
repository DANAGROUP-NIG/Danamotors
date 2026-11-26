import { Request, RequestHandler, Response } from "express";
import router from "./requisition.routes";
import { PERMISSIONS } from "../../shared/constants/roles";

type RouteLayer = {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: { handle: RequestHandler }[];
  };
};
it("resolves the mounted options URL before document ids and requires all three grants", () => {
  const layers = router.stack as RouteLayer[];
  const index = layers.findIndex(
    (layer) =>
      layer.route?.path === "/requisitions/part-options" &&
      layer.route.methods.get,
  );
  expect(index).toBeGreaterThanOrEqual(0);
  expect(index).toBeLessThan(
    layers.findIndex((layer) => layer.route?.path === "/requisitions/:id"),
  );
  const grants = [
    PERMISSIONS.REQUISITION_CREATE,
    PERMISSIONS.SPAREPART_READ,
    PERMISSIONS.STOCK_READ,
  ];
  const route = layers[index].route!;
  grants.forEach((grant, position) => {
    const middleware = route.stack[position].handle;
    const request = (permissions: string[]) =>
      ({ user: { role: "Custom", permissions } }) as unknown as Request;
    expect(() =>
      middleware(
        request(grants.filter((permission) => permission !== grant)),
        {} as Response,
        jest.fn(),
      ),
    ).toThrow("required permissions");
    const next = jest.fn();
    middleware(request(grants), {} as Response, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
