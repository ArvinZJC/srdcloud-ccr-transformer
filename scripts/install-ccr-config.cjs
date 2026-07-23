"use strict";

const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const {
  codefreeAuthFileFromEnvironment,
  withSRDCloudCoreGatewayPlugin,
  writeGatewayPluginRuntimeConfig
} = require("../src/ccr-config.cjs");

const projectRoot = path.resolve(__dirname, "..");
const defaultDbPath = path.join(os.homedir(), ".claude-code-router", "config.sqlite");
const dbPath = process.env.CCR_CONFIG_DB || defaultDbPath;
const dryRun = process.argv.includes("--dry-run");
const quiet = process.env.SRDCLOUD_CCR_INSTALL_QUIET === "1";
const codefreeAuthFile = codefreeAuthFileFromEnvironment();
const flattenToolMessages = process.argv.includes("--flatten-tool-messages");
const discoverModelLimits = process.argv.includes("--discover-model-limits");
const logLevelIndex = process.argv.indexOf("--log-level");
const logLevel = logLevelIndex >= 0 ? process.argv[logLevelIndex + 1] : undefined;
const maxTokensCapIndex = process.argv.indexOf("--max-tokens-cap");
const maxTokensCap = maxTokensCapIndex >= 0 ? Number(process.argv[maxTokensCapIndex + 1]) : undefined;
const subServiceIndex = process.argv.indexOf("--sub-service");
const subService = subServiceIndex >= 0 ? process.argv[subServiceIndex + 1] : undefined;
const pluginDataDir = path.join(os.homedir(), ".claude-code-router", "app-data", "plugins", "srdcloud-transformer");
const logFile = path.join(pluginDataDir, "srdcloud-transformer.log");

function sqlite(args) {
  return childProcess.execFileSync("sqlite3", [dbPath, ...args], {
    encoding: "utf8",
  });
}

function readDefaultConfig() {
  try {
    const database = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const row = database.prepare("select value_json from app_config where key = ?").get("default");
      if (!row?.value_json) {
        throw new Error(`No default CCR config found in ${dbPath}`);
      }
      return JSON.parse(row.value_json);
    } finally {
      database.close();
    }
  } catch (error) {
    if (!String(error.message).includes("No default CCR config")) {
      const json = sqlite(["select value_json from app_config where key='default'"]);
      if (json.trim()) {
        return JSON.parse(json);
      }
    }
    throw error;
  }
}

function writeDefaultConfig(appConfig) {
  const payload = JSON.stringify(appConfig);
  const updatedAt = new Date().toISOString();
  const database = new DatabaseSync(dbPath);
  try {
    database
      .prepare("update app_config set value_json = json(?), updated_at = ? where key = ?")
      .run(payload, updatedAt, "default");
  } finally {
    database.close();
  }
}

if (!fs.existsSync(dbPath)) {
  throw new Error(`CCR config database not found: ${dbPath}`);
}

const current = readDefaultConfig();
const { appConfig, gatewayPlugin } = withSRDCloudCoreGatewayPlugin(current, {
  projectRoot,
  pluginConfigDefaults: {
    ...(codefreeAuthFile ? { codefreeAuthFile } : {}),
    ...(discoverModelLimits ? { discoverModelLimits: true } : {}),
    ...(flattenToolMessages ? { flattenToolMessages: true } : {}),
    logFile,
    ...(logLevel ? { logLevel } : {}),
    ...(Number.isInteger(maxTokensCap) && maxTokensCap > 0 ? { maxTokensCap } : {}),
    ...(subService ? { subService } : {})
  }
});

function redactedGatewayPlugin(plugin) {
  return plugin?.config?.codefreeAuthFile
    ? {
      ...plugin,
      config: {
        ...plugin.config,
        codefreeAuthFile: "<configured>"
      }
    }
    : plugin;
}

if (dryRun) {
  if (!quiet) {
    process.stdout.write(`${JSON.stringify({
      dryRun: true,
      gatewayPlugin: redactedGatewayPlugin(gatewayPlugin)
    }, null, 2)}\n`);
  }
} else {
  writeDefaultConfig(appConfig);
  const runtimeConfigPath = writeGatewayPluginRuntimeConfig(gatewayPlugin.config, { projectRoot });
  if (!quiet) {
    process.stdout.write(`${JSON.stringify({
      dryRun: false,
      gatewayPlugin: redactedGatewayPlugin(gatewayPlugin),
      runtimeConfigPath
    }, null, 2)}\n`);
  }
}
