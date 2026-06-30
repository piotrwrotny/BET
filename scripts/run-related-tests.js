import { execSync } from "node:child_process";

/**
 * @returns {Promise<string>}
 */
function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += typeof chunk === "string" ? chunk : String(chunk);
    });
    process.stdin.on("end", () => {
      resolve(data);
    });
    process.stdin.on("error", reject);
  });
}

const HIGH_RISK_PATTERNS = [
  /^src\/lib\/verify-exercise\.ts$/,
  /^src\/lib\/verify-exercise\.test\.ts$/,
  /^src\/lib\/verify-contract\.test\.ts$/,
  /^src\/pages\/api\/exercises\/verify\.ts$/,
];

async function main() {
  const input = await readStdin();
  if (input.trim().length === 0) {
    process.exit(0);
  }

  const payload = parseJson(input);
  const filePath = getFilePath(payload);
  if (filePath === undefined) {
    process.exit(0);
  }

  if (!HIGH_RISK_PATTERNS.some((pattern) => pattern.test(filePath))) {
    process.exit(0);
  }

  try {
    execSync(`npx vitest related "${filePath}" --run`, {
      cwd: process.cwd(),
      stdio: "inherit",
      env: { ...process.env, AI_AGENT: "1" },
    });
  } catch (error) {
    const status = extractExitStatus(error);
    process.exit(status);
  }
}

/**
 * @param {string} text
 * @returns {unknown}
 */
function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * @param {unknown} value
 * @returns {string | undefined}
 */
function getFilePath(value) {
  if (!isRecord(value)) {
    return undefined;
  }
  const toolInput = value.tool_input;
  if (!isRecord(toolInput)) {
    return undefined;
  }
  const filePath = toolInput.file_path;
  return typeof filePath === "string" ? filePath : undefined;
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return value !== null && typeof value === "object";
}

/**
 * @param {unknown} error
 * @returns {number}
 */
function extractExitStatus(error) {
  if (!isRecord(error)) {
    return 2;
  }
  const status = error.status;
  return typeof status === "number" ? status : 2;
}

await main();
