import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

type PackageJson = {
  version?: string;
};

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as PackageJson;

export const serverVersion = pkg.version ?? "0.0.0";

function readGitCommit(): string | null {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const commitFile = resolve(__dirname, "../../.git-commit");
    return readFileSync(commitFile, "utf-8").trim() || null;
  } catch {
    return null;
  }
}

export const serverCommit = readGitCommit();
