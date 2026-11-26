import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function load(relative) {
  const module = { exports: {} };
  const source = fs.readFileSync(new URL(relative, import.meta.url), "utf8");
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    { module, exports: module.exports },
  );
  return module.exports;
}
const client = load("../features/auth/roles.ts");
const server = load("../../server/src/shared/constants/roles.ts");
const { getPermissionLabel } = load("../features/settings/lib/permission-label.ts");

test("role settings distinguish every CSI action and retain nested permission actions", () => {
  const labels = Object.values(client.CSI_PERMISSIONS).map(getPermissionLabel);
  assert.equal(new Set(labels).size, 8);
  assert.equal(getPermissionLabel("csi:master:read"), "View CSI masters");
  assert.equal(getPermissionLabel("csi:master:update"), "Manage CSI masters");
  assert.equal(getPermissionLabel("jobcard:late-reason:update"), "Late Reason Update");
  assert.equal(getPermissionLabel("customer:read"), "Read");
});

test("frontend CSI permissions exactly match the backend identifiers used by the role seed", () => {
  const backend = Object.entries(server.PERMISSIONS)
    .filter(([name]) => name.startsWith("CSI_"))
    .map(([, permission]) => permission)
    .sort();
  assert.deepEqual([...Object.values(client.CSI_PERMISSIONS)].sort(), backend);
  assert.equal(new Set(Object.values(client.CSI_PERMISSIONS)).size, 8);
  for (const permission of client.CSI_REPORT_PERMISSIONS)
    assert.ok(client.FRAMEWORK_REPORT_PERMISSIONS.includes(permission));
});

test("legacy workshop role access recognizes service managers and stays consistent with server CSI grants", () => {
  assert.ok(
    client.WORKSHOP_ROLES.includes(server.ROLES.SERVICE_MANAGER.toLowerCase()),
  );
  for (const role of [server.ROLES.ADMIN, server.ROLES.SERVICE_MANAGER]) {
    for (const permission of Object.values(client.CSI_PERMISSIONS))
      assert.ok(server.ROLE_PERMISSIONS[role].includes(permission));
  }
  for (const role of [server.ROLES.WORKSHOP_MANAGER, server.ROLES.AUDITOR]) {
    assert.ok(
      server.ROLE_PERMISSIONS[role].includes(
        client.CSI_PERMISSIONS.RESPONSE_READ,
      ),
    );
    assert.equal(
      server.ROLE_PERMISSIONS[role].includes(
        client.CSI_PERMISSIONS.RESPONSE_UPDATE,
      ),
      false,
    );
    assert.equal(
      server.ROLE_PERMISSIONS[role].includes(
        client.CSI_PERMISSIONS.CARD_GENERATE,
      ),
      false,
    );
  }
});
