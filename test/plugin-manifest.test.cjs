"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const extension = require("../index.cjs");
const manifest = require("../plugin.json");

test("CCR 3.0.17 manifest grants exactly the surfaces and permissions used by the extension", async () => {
  const permissions = new Set(Array.isArray(manifest.permissions) ? manifest.permissions : []);
  const surfaces = manifest.surfaces && typeof manifest.surfaces === "object"
    ? manifest.surfaces
    : {};
  const consumedPermissions = new Set();
  const consumedSurfaces = new Set();
  const requirePermission = (permission) => {
    assert.equal(permissions.has(permission), true, `missing permission: ${permission}`);
    consumedPermissions.add(permission);
  };
  const requireGrant = (surface, permission) => {
    assert.equal(surfaces[surface], true, `disabled surface: ${surface}`);
    consumedSurfaces.add(surface);
    requirePermission(permission);
  };

  requirePermission("trusted-code");
  const routes = [];
  const registration = await extension.setup({
    config: {
      Providers: [],
      virtualModelProfiles: []
    },
    logger: { info() {} },
    paths: {
      pluginDataDir: "/tmp/srdcloud-transformer-plugin"
    },
    pluginConfig: {
      credentials: null
    },
    pluginId: manifest.id,
    registerGatewayRoute(route) {
      requireGrant("gateway", "gateway-routes");
      routes.push(route);
    }
  });

  for (const app of manifest.apps ?? []) {
    assert.equal(typeof app.url, "string");
    requireGrant("apps", "apps");
  }
  if (registration.coreGateway?.config) {
    requireGrant("gateway", "core-gateway-config");
  }

  assert.equal(routes.length, 1);
  assert.deepEqual([...permissions].sort(), [...consumedPermissions].sort());
  assert.deepEqual(
    Object.entries(surfaces)
      .filter(([, enabled]) => enabled === true)
      .map(([surface]) => surface)
      .sort(),
    [...consumedSurfaces].sort()
  );
});
