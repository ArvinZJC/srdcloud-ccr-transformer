"use strict";

const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { AUTH_FILE_SCHEMA_VERSION } = require("./codefree-token-auth.cjs");
const {
  CODEFREE_AUTH_PROVENANCE_PATH,
  loadCodeFreeAuthProvenance,
  matchKnownCodeFreeArtifact,
  validateCodeFreeAuthProvenance
} = require("./codefree-auth-provenance.cjs");
const {
  validateAndExtractCodeFreeAuthMaterial
} = require("./codefree-auth-extractor.cjs");

const DEFAULT_BASE_URL = "https://www.srdcloud.cn";

function setupError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function commandOutput(execFileSync, command, args, code, message) {
  try {
    return String(execFileSync(command, args, { encoding: "utf8" })).trim();
  } catch {
    throw setupError(code, message);
  }
}

function locateCodeFreeCommand(execFileSync, runtimePlatform) {
  const locator = runtimePlatform === "win32" ? "where.exe" : "/usr/bin/which";
  const output = commandOutput(
    execFileSync,
    locator,
    ["codefree-o"],
    "COMMAND_UNAVAILABLE",
    "CodeFree-O is not available locally."
  );
  const commandPath = output.split(/\r?\n/).find((line) => line.trim())?.trim();
  if (!commandPath) {
    throw setupError("COMMAND_UNAVAILABLE", "CodeFree-O is not available locally.");
  }
  return commandPath;
}

function inspectableCodeFreeBinaryPath(commandPath, runtimePlatform, fileSystem) {
  if (
    runtimePlatform === "win32" &&
    /\.(?:bat|cmd|ps1)$/i.test(commandPath)
  ) {
    return path.win32.join(
      path.win32.dirname(commandPath),
      "node_modules",
      "@srdcloud",
      "codefree-o",
      "bin",
      "codefree-o.exe"
    );
  }
  try {
    return fileSystem.realpathSync(commandPath);
  } catch {
    return commandPath;
  }
}

function parseVersion(output) {
  const match = output.match(/\b(\d+\.\d+\.\d+)\b/);
  if (!match) {
    throw setupError("VERSION_INVALID", "Unable to determine the installed CodeFree-O version.");
  }
  return match[1];
}

function versionAtLeast(version, minimum) {
  const actual = version.split(".").map(Number);
  const floor = minimum.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (actual[index] !== floor[index]) {
      return actual[index] > floor[index];
    }
  }
  return true;
}

function parseDataDirectory(output) {
  const match = output.match(/^data\s+(.+)$/m);
  if (!match || !match[1].trim()) {
    throw setupError("PATHS_INVALID", "Unable to determine CodeFree-O local data storage.");
  }
  return match[1].trim();
}

function privateBaseUrl(credentialFile, fileSystem) {
  try {
    const value = JSON.parse(fileSystem.readFileSync(credentialFile, "utf8"));
    return typeof value.baseUrlSnapshot === "string" && value.baseUrlSnapshot.trim()
      ? value.baseUrlSnapshot.trim()
      : DEFAULT_BASE_URL;
  } catch {
    return DEFAULT_BASE_URL;
  }
}

function writePrivateJson(filePath, value, options = {}) {
  const fileSystem = options.fs || fs;
  const randomBytes = options.randomBytes || crypto.randomBytes;
  const directory = path.dirname(filePath);
  fileSystem.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fileSystem.chmodSync(directory, 0o700);
  const temporaryPath = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`
  );
  try {
    fileSystem.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
      flag: "wx",
      mode: 0o600
    });
    fileSystem.renameSync(temporaryPath, filePath);
    fileSystem.chmodSync(filePath, 0o600);
  } catch {
    try {
      fileSystem.rmSync(temporaryPath, { force: true });
    } catch {
      // Preserve the setup error category.
    }
    throw setupError("AUTH_FILE_WRITE", "CodeFree token authentication setup could not be saved.");
  }
}

function defaultConfigureCcr(authFilePath, execFileSync = childProcess.execFileSync) {
  const installerPath = path.resolve(__dirname, "../scripts/install-ccr-config.cjs");
  execFileSync(process.execPath, [installerPath], {
    env: {
      ...process.env,
      SRDCLOUD_CCR_INSTALL_QUIET: "1",
      SRDCLOUD_CODEFREE_AUTH_FILE: authFilePath
    },
    stdio: "ignore"
  });
}

function setupCodeFreeAuth(options = {}) {
  const execFileSync = options.execFileSync || childProcess.execFileSync;
  const fileSystem = options.fs || fs;
  const runtimePlatform = options.runtimePlatform || process.platform;
  const commandPath = options.commandPath ||
    locateCodeFreeCommand(execFileSync, runtimePlatform);
  const codefreeVersion = parseVersion(
    commandOutput(
      execFileSync,
      commandPath,
      ["--version"],
      "VERSION_INVALID",
      "Unable to determine the installed CodeFree-O version."
    )
  );
  const provenance = options.provenance
    ? validateCodeFreeAuthProvenance(options.provenance)
    : loadCodeFreeAuthProvenance();
  if (!versionAtLeast(codefreeVersion, provenance.semanticProfile.minimumVersion)) {
    throw setupError(
      "VERSION_UNSUPPORTED",
      "CodeFree-O 1.4.0 or later is required for token authentication."
    );
  }
  const dataDirectory = parseDataDirectory(
    commandOutput(
      execFileSync,
      commandPath,
      ["debug", "paths"],
      "PATHS_INVALID",
      "Unable to determine CodeFree-O local data storage."
    )
  );
  let binary;
  const binaryPath = inspectableCodeFreeBinaryPath(
    commandPath,
    runtimePlatform,
    fileSystem
  );
  try {
    binary = options.readBinary
      ? options.readBinary(binaryPath)
      : fileSystem.readFileSync(binaryPath);
  } catch {
    throw setupError("BINARY_READ", "Unable to inspect the installed CodeFree-O binary.");
  }
  const identity = {
    binaryBytes: binary.length,
    binarySha256: crypto.createHash("sha256").update(binary).digest("hex"),
    codefreeVersion,
    platform: options.platform || `${process.platform}-${process.arch}`
  };
  const artifact = matchKnownCodeFreeArtifact(provenance, identity);
  const material = validateAndExtractCodeFreeAuthMaterial(
    binary.toString("latin1"),
    provenance.semanticProfile
  );
  const verificationMode = artifact ? "known-artifact" : "semantic-contract";
  const credentialFile = path.join(dataDirectory, "codefree.json");
  const outputFile = options.outputFile || path.join(
    os.homedir(),
    ".claude-code-router",
    "app-data",
    "plugins",
    "srdcloud-transformer",
    "codefree-auth.json"
  );
  writePrivateJson(outputFile, {
    schemaVersion: AUTH_FILE_SCHEMA_VERSION,
    source: {
      binarySha256: identity.binarySha256,
      codefreeVersion,
      semanticProfile: provenance.semanticProfile.id,
      verificationMode
    },
    baseUrl: privateBaseUrl(credentialFile, fileSystem),
    clientId: material.clientId,
    clientSecret: material.clientSecret,
    credentialFile,
    refreshEncryptionKey: material.refreshEncryptionKey,
    signingSecret: material.signingSecret
  }, options);

  const configureCcr = options.configureCcr ||
    ((authFilePath) => defaultConfigureCcr(authFilePath, execFileSync));
  try {
    configureCcr(outputFile);
  } catch {
    throw setupError("CCR_CONFIGURE", "CodeFree token authentication could not be added to CCR.");
  }
  const result = {
    binarySha256: identity.binarySha256,
    codefreeVersion,
    configured: true,
    restartRequired: true,
    verificationMode
  };
  options.write?.(JSON.stringify(result));
  return result;
}

module.exports = {
  CODEFREE_AUTH_PROVENANCE_PATH,
  loadCodeFreeAuthProvenance,
  matchKnownCodeFreeArtifact,
  setupCodeFreeAuth
};
