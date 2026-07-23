"use strict";

const { setupCodeFreeAuth } = require("../src/codefree-auth-setup.cjs");

try {
  const result = setupCodeFreeAuth();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
