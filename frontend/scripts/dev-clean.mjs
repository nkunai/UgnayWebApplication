import { existsSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import { resolve } from "node:path";
import next from "next";

const cliArgs = process.argv.slice(2);
const clean = cliArgs.includes("--clean");

function parseOption(longFlag, shortFlag, fallbackValue) {
  const longIndex = cliArgs.indexOf(longFlag);
  if (longIndex >= 0 && cliArgs[longIndex + 1]) {
    return cliArgs[longIndex + 1];
  }

  const shortIndex = cliArgs.indexOf(shortFlag);
  if (shortIndex >= 0 && cliArgs[shortIndex + 1]) {
    return cliArgs[shortIndex + 1];
  }

  return fallbackValue;
}

if (clean) {
  for (const dir of [".next", ".turbo"]) {
    rmSync(resolve(process.cwd(), dir), { recursive: true, force: true });
  }

  console.log("Cleared Next.js local caches.");
}

function stripInlineComment(value) {
  const index = value.indexOf(" #");
  if (index === -1) {
    return value;
  }
  return value.slice(0, index);
}

function parseEnvValue(rawValue) {
  const trimmed = rawValue.trim();
  if (trimmed.length === 0) {
    return "";
  }

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    const body = trimmed.slice(1, -1);
    if (trimmed.startsWith('"')) {
      return body
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
    }
    return body;
  }

  return stripInlineComment(trimmed).trim();
}

function loadEnvFile(fileName, externalKeys) {
  const absolutePath = resolve(process.cwd(), fileName);
  if (!existsSync(absolutePath)) {
    return;
  }

  const raw = readFileSync(absolutePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) {
      continue;
    }

    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) {
      continue;
    }

    const [, key, rawValue = ""] = match;
    if (externalKeys.has(key)) {
      continue;
    }

    process.env[key] = parseEnvValue(rawValue);
  }
}

const externalEnvKeys = new Set(Object.keys(process.env));
loadEnvFile(".env.shared", externalEnvKeys);
loadEnvFile(".env.local", externalEnvKeys);

const host = parseOption("--hostname", "-H", process.env.HOST ?? "0.0.0.0");
const portRaw = parseOption("--port", "-p", process.env.PORT ?? "3000");
const port = Number.parseInt(portRaw, 10);
if (!Number.isInteger(port) || port <= 0) {
  console.error(`Invalid port: ${portRaw}`);
  process.exit(1);
}

const networkUrls = Object.values(networkInterfaces())
  .flat()
  .filter((iface) => iface && iface.family === "IPv4" && !iface.internal)
  .map((iface) => `http://${iface.address}:${port}`);

if (host === "0.0.0.0" && networkUrls.length > 0) {
  console.log("Available on your network:");
  for (const url of [...new Set(networkUrls)]) {
    console.log(`  - ${url}`);
  }
}

console.log(`Frontend app: http://localhost:${port}`);
console.log("Dev mode: in-process Next.js server (forkless startup).");

const app = next({ dev: true, dir: process.cwd(), hostname: host, port });
const handle = app.getRequestHandler();

await app.prepare();

const server = createServer((req, res) => {
  handle(req, res);
});

await new Promise((resolvePromise, rejectPromise) => {
  server.once("error", rejectPromise);
  server.listen(port, host, () => {
    server.removeListener("error", rejectPromise);
    resolvePromise();
  });
});

let closing = false;
function shutdown(signal) {
  if (closing) {
    return;
  }
  closing = true;
  console.log(`Received ${signal}. Shutting down frontend dev server...`);
  server.close((error) => {
    if (error) {
      console.error(error);
      process.exit(1);
      return;
    }
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
