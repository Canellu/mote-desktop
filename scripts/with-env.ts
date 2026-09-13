/**
 * Runs a command with the repository's local environment file loaded.
 *
 * `commands::feedback` reads `MOTE_FEEDBACK_APP_TOKEN` through `option_env!`,
 * which resolves at compile time. A build that cannot see it produces an app
 * whose feedback button tells the reporter to send an email instead — and a
 * plain `bun tauri dev` in a fresh shell cannot see it. Rather than asking
 * everyone to remember an export, the `tauri` script goes through here.
 *
 * The release case is guarded twice: this script supplies the value, and
 * `feedback.rs` refuses to compile a release build without it.
 *
 * Values already in the environment win, so an explicit export still overrides
 * the file, and CI can inject the token as a secret without one existing.
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Deliberately minimal: `KEY=value`, `#` comments, optional surrounding quotes. */
const parseEnvFile = (contents: string): Record<string, string> => {
  const values: Record<string, string> = {};

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;

    const key = trimmed.slice(0, separator).trim();
    const raw = trimmed.slice(separator + 1).trim();
    const unquoted =
      (raw.startsWith('"') && raw.endsWith('"')) ||
      (raw.startsWith("'") && raw.endsWith("'"))
        ? raw.slice(1, -1)
        : raw;

    if (unquoted) values[key] = unquoted;
  }

  return values;
};

const loaded: Record<string, string> = {};

// Later files do not override earlier ones, so `.env.local` is the specific one.
for (const name of [".env.local", ".env"]) {
  const path = join(repositoryRoot, name);
  if (!existsSync(path)) continue;

  for (const [key, value] of Object.entries(
    parseEnvFile(readFileSync(path, "utf8")),
  )) {
    if (!(key in loaded)) loaded[key] = value;
  }
}

const [command, ...args] = process.argv.slice(2);

if (!command) {
  console.error("Usage: bun scripts/with-env.ts <command> [...args]");
  process.exit(2);
}

if (!process.env.MOTE_FEEDBACK_APP_TOKEN && !loaded.MOTE_FEEDBACK_APP_TOKEN) {
  // A warning rather than an error: the app is perfectly usable without it, and
  // a release build fails at compile time anyway.
  console.warn(
    "\x1b[33mwarn\x1b[0m  MOTE_FEEDBACK_APP_TOKEN is not set — this build will not be able to send feedback.\n" +
      "      Add it to .env.local to enable the in-app feedback form.",
  );
}

// `shell: true` so Windows resolves the `.cmd` shims in node_modules/.bin.
const child = spawn(command, args, {
  cwd: repositoryRoot,
  stdio: "inherit",
  shell: true,
  env: { ...loaded, ...process.env },
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
