// Review and synchronize Pi configuration to the dotfiles repository.
// Set PI_DOTFILES_REPO to override the discovered repository location.
// @ts-nocheck

import { existsSync, watch } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const agentDir = join(homedir(), ".pi", "agent");
const extensionsDir = join(agentDir, "extensions");
const npmDir = join(agentDir, "npm");
const defaultDotfilesDir = [join(homedir(), "dotfiles"), join(homedir(), "Projects", "dotfiles")]
  .find((directory) => existsSync(join(directory, ".git"))) ?? join(homedir(), "dotfiles");
const dotfilesDir = resolve(process.env.PI_DOTFILES_REPO ?? defaultDotfilesDir);
const snapshotDir = join(dotfilesDir, "dot_pi", "agent");
const syncScript = join(dotfilesDir, "scripts", "sync-pi-extensions.sh");
const mirroredFiles = ["settings.json", "npm/package.json", "npm/package-lock.json"];
const watchedFiles = new Set(mirroredFiles.map((path) => join(agentDir, path)));
const managedPaths = ["dot_pi", "scripts/sync-pi-extensions.sh"];
const ignoreFileName = ".sync-dotfiles-ignore";

/** Match direct extension filenames against the sync popup's ignore rules. */
async function readExtensionFiles(directory) {
  try {
    const entries = await readdir(directory);
    const rules = (await readFile(join(directory, ignoreFileName), "utf8").catch(() => ""))
      .split(/\r?\n/)
      .map((rule) => rule.trim())
      .filter((rule) => rule && !rule.startsWith("#"));
    return entries.filter((name) => {
      if (!name.endsWith(".ts") && !name.endsWith(".js")) return false;
      let ignored = false;
      for (const rule of rules) {
        const negated = rule.startsWith("!");
        const pattern = (negated ? rule.slice(1) : rule).replace(/^\//, "");
        if (!pattern || pattern.includes("/")) continue;
        const expression = new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`);
        if (expression.test(name)) ignored = !negated;
      }
      return !ignored;
    }).sort();
  } catch {
    return [];
  }
}

async function configurationDiffersFromSnapshot() {
  try {
    for (const path of mirroredFiles) {
      const [source, snapshot] = await Promise.all([
        readFile(join(agentDir, path)),
        readFile(join(snapshotDir, path)),
      ]);
      if (!source.equals(snapshot)) return true;
    }

    const extensionNames = await readExtensionFiles(extensionsDir);
    const snapshotExtensionNames = await readExtensionFiles(join(snapshotDir, "extensions"));
    if (extensionNames.join("\n") !== snapshotExtensionNames.join("\n")) return true;

    for (const name of extensionNames) {
      const [source, snapshot] = await Promise.all([
        readFile(join(extensionsDir, name)),
        readFile(join(snapshotDir, "extensions", name)),
      ]);
      if (!source.equals(snapshot)) return true;
    }
    return false;
  } catch {
    return true;
  }
}

export default function (pi) {
  let debounceTimer;
  let promptOpen = false;
  let changedWhilePromptOpen = false;
  const watchers = [];

  const notifyError = (ctx, message) => ctx.ui.notify(message, "error");

  const prepareReview = async (ctx) => {
    const readPackageVersions = async (path) => {
      try {
        return JSON.parse(await readFile(path, "utf8")).dependencies ?? {};
      } catch {
        return {};
      }
    };
    const [currentPackages, snapshotPackages, currentExtensions, snapshotExtensions] = await Promise.all([
      readPackageVersions(join(npmDir, "package.json")),
      readPackageVersions(join(snapshotDir, "npm", "package.json")),
      readExtensionFiles(extensionsDir),
      readExtensionFiles(join(snapshotDir, "extensions")),
    ]);
    const packageNames = new Set([...Object.keys(currentPackages), ...Object.keys(snapshotPackages)]);
    const packageChanges = [...packageNames].sort().flatMap((name) => {
      if (!(name in snapshotPackages)) return [`+ ${name} ${currentPackages[name]}`];
      if (!(name in currentPackages)) return [`- ${name} ${snapshotPackages[name]}`];
      if (currentPackages[name] !== snapshotPackages[name]) return [`~ ${name}: ${snapshotPackages[name]} → ${currentPackages[name]}`];
      return [];
    });
    const currentExtensionSet = new Set(currentExtensions);
    const snapshotExtensionSet = new Set(snapshotExtensions);
    const extensionChanges = [
      ...currentExtensions.filter((name) => !snapshotExtensionSet.has(name)).map((name) => `+ ${name}`),
      ...snapshotExtensions.filter((name) => !currentExtensionSet.has(name)).map((name) => `- ${name}`),
    ];
    for (const name of currentExtensions.filter((name) => snapshotExtensionSet.has(name))) {
      const [current, snapshot] = await Promise.all([
        readFile(join(extensionsDir, name)),
        readFile(join(snapshotDir, "extensions", name)),
      ]);
      if (!current.equals(snapshot)) extensionChanges.push(`~ ${name}`);
    }

    const summary = [
      `Repository: ${dotfilesDir}`,
      "",
      "Package extensions (+ added, - removed, ~ upgraded):",
      ...(packageChanges.length > 0 ? packageChanges : ["(No package extension changes.)"]),
      "",
      "Local extensions (+ added, - removed, ~ updated):",
      ...(extensionChanges.length > 0 ? extensionChanges : ["(No local extension changes.)"]),
    ].join("\n");

    const sync = await pi.exec("bash", [syncScript], { signal: ctx.signal });
    if (sync.code !== 0) {
      notifyError(ctx, `Pi sync failed: ${sync.stderr || sync.stdout}`);
      return;
    }
    return { summary };
  };

  const syncAndPush = async (ctx) => {
    const add = await pi.exec("git", ["-C", dotfilesDir, "add", "--", ...managedPaths], {
      signal: ctx.signal,
    });
    if (add.code !== 0) {
      notifyError(ctx, `Could not stage Pi configuration: ${add.stderr}`);
      return;
    }

    const staged = await pi.exec("git", ["-C", dotfilesDir, "diff", "--cached", "--quiet", "--", ...managedPaths], {
      signal: ctx.signal,
    });
    if (staged.code === 0) {
      ctx.ui.notify("Pi configuration is already synchronized.", "info");
      return;
    }
    if (staged.code !== 1) {
      notifyError(ctx, `Could not inspect staged Pi changes: ${staged.stderr}`);
      return;
    }

    const commit = await pi.exec("git", [
      "-C", dotfilesDir, "commit", "--only", "-m", "chore(pi): sync configuration", "--", ...managedPaths,
    ], {
      signal: ctx.signal,
    });
    if (commit.code !== 0) {
      notifyError(ctx, `Could not commit Pi configuration: ${commit.stderr || commit.stdout}`);
      return;
    }

    const push = await pi.exec("git", ["-C", dotfilesDir, "push"], { signal: ctx.signal });
    if (push.code !== 0) {
      notifyError(ctx, `Pi configuration was committed but not pushed: ${push.stderr || push.stdout}`);
      return;
    }

    ctx.ui.notify("Pi configuration was committed and pushed to GitHub.", "info");
  };

  const promptToSync = async (ctx) => {
    if (promptOpen) {
      changedWhilePromptOpen = true;
      return;
    }

    promptOpen = true;
    try {
      const prepared = await prepareReview(ctx);
      if (!prepared) return;
      const confirmed = await ctx.ui.confirm(
        "Pi extension changes",
        `${prepared.summary}\n\nCommit and push this Pi configuration to GitHub?`,
      );
      if (confirmed) await syncAndPush(ctx);
    } finally {
      promptOpen = false;
      if (changedWhilePromptOpen) {
        changedWhilePromptOpen = false;
        schedulePrompt(ctx);
      }
    }
  };

  const schedulePrompt = (ctx) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => void promptToSync(ctx), 750);
  };

  const watchDirectory = (directory, shouldTrack) => {
    if (!existsSync(directory)) return;
    watchers.push(watch(directory, (_event, name) => {
      if (name && shouldTrack(join(directory, name.toString()))) schedulePrompt(currentContext);
    }));
  };

  let currentContext;

  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI || !existsSync(syncScript)) return;
    currentContext = ctx;
    watchDirectory(agentDir, (path) => watchedFiles.has(path));
    watchDirectory(npmDir, (path) => watchedFiles.has(path));
    watchDirectory(extensionsDir, () => true);
    if (await configurationDiffersFromSnapshot()) schedulePrompt(ctx);
  });

  pi.on("session_shutdown", () => {
    clearTimeout(debounceTimer);
    for (const watcher of watchers.splice(0)) watcher.close();
    currentContext = undefined;
  });
}
