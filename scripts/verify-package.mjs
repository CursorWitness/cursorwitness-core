import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { rm } from "node:fs/promises";

const command = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "pnpm";
const args = process.platform === "win32" ? ["/d", "/s", "/c", "pnpm.cmd pack --json"] : ["pack", "--json"];
const metadata = JSON.parse(execFileSync(command, args, { cwd: process.cwd(), encoding: "utf8" }));
await rm(metadata.filename, { force: true });
const files = new Set(metadata.files.map((entry) => entry.path));
for (const required of ["package.json", "README.md", "LICENSE", "dist/index.js", "schemas/fixture-v1.schema.json", "schemas/report-v1.schema.json"]) assert.equal(files.has(required), true, `package is missing ${required}`);
for (const forbidden of [".git/", "node_modules/", "test/", "src/"]) assert.equal([...files].some((path) => path === forbidden || path.startsWith(forbidden)), false, `package contains ${forbidden}`);
console.log(`corePackageVerification: true (${files.size} files)`);
