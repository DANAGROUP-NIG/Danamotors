import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

function loadTypeScript(url) {
  const module = { exports: {} };
  const { outputText } = ts.transpileModule(readFileSync(url, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const require = createRequire(url);
  new Function("require", "module", "exports", outputText)(
    (path) => path.startsWith(".") ? loadTypeScript(new URL(`${path}.ts`, url)) : require(path),
    module,
    module.exports,
  );
  return module.exports;
}

const { createCustomerSchema, createBookingCustomerSchema } = loadTypeScript(
  new URL("../features/customers/schemas/customer.schema.ts", import.meta.url),
);
const baseCustomer = {
  firstName: "Synthetic",
  lastName: "Customer",
  branchId: "branch",
  phoneNumber: "08012345678",
};

test("booking quick-create requires contact details and one identifier", () => {
  const incomplete = createBookingCustomerSchema.safeParse(baseCustomer);
  assert.equal(incomplete.success, false);
  assert.deepEqual(incomplete.error.issues.map(({ path }) => path[0]), [
    "tin", "email", "address", "postalCode",
  ]);
  assert.equal(createCustomerSchema.safeParse(baseCustomer).success, true);
});

test("booking quick-create accepts either identifier with complete contact details", () => {
  const contact = { ...baseCustomer, email: "fixture@example.test", address: "Synthetic address", postalCode: "100001" };
  assert.equal(createBookingCustomerSchema.safeParse({ ...contact, tin: "TEST-144" }).success, true);
  assert.equal(createBookingCustomerSchema.safeParse({ ...contact, nin: "00000000001" }).success, true);
  assert.equal(createBookingCustomerSchema.safeParse({ ...contact, nin: "0000000000A" }).success, false);
});
