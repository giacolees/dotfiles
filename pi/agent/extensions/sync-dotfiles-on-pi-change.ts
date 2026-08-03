// Synchronize Pi configuration to the dotfiles repository after a user confirmation.
// Set PI_DOTFILES_REPO to override the default ~/dotfiles repository location.
// @ts-nocheck

import { watch } from "node:fs";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const agentDir = join(homedir(), ".pi", "agent");
const extensionsDir = join(agentDir, "extensions");
const npmDir = join(agentDir, "npm");
const dotfilesDir = resolve(
	process.env.PI_DOTFILES_REPO ?? join(homedir(), "dotfiles"),
);
const syncScript = join(dotfilesDir, "scripts", "sync-pi-extensions.sh");
const mirroredFiles = [
	"settings.json",
	"npm/package.json",
	"npm/package-lock.json",
];
const watchedFiles = new Set(mirroredFiles.map((path) => join(agentDir, path)));

async function configurationDiffersFromSnapshot() {
	try {
		for (const path of mirroredFiles) {
			const [source, snapshot] = await Promise.all([
				readFile(join(agentDir, path)),
				readFile(join(dotfilesDir, "pi", "agent", path)),
			]);
			if (!source.equals(snapshot)) return true;
		}

		const extensionNames = (await readdir(extensionsDir))
			.filter((name) => name.endsWith(".ts") || name.endsWith(".js"))
			.sort();
		const snapshotExtensionNames = (
			await readdir(join(dotfilesDir, "pi", "agent", "extensions"))
		)
			.filter((name) => name.endsWith(".ts") || name.endsWith(".js"))
			.sort();
		if (extensionNames.join("\n") !== snapshotExtensionNames.join("\n"))
			return true;

		for (const name of extensionNames) {
			const [source, snapshot] = await Promise.all([
				readFile(join(extensionsDir, name)),
				readFile(join(dotfilesDir, "pi", "agent", "extensions", name)),
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

	const syncAndPush = async (ctx) => {
		const sync = await pi.exec("bash", [syncScript], { signal: ctx.signal });
		if (sync.code !== 0) {
			notifyError(ctx, `Pi sync failed: ${sync.stderr || sync.stdout}`);
			return;
		}

		const add = await pi.exec(
			"git",
			["-C", dotfilesDir, "add", "--", "pi", "scripts/sync-pi-extensions.sh"],
			{
				signal: ctx.signal,
			},
		);
		if (add.code !== 0) {
			notifyError(ctx, `Could not stage Pi configuration: ${add.stderr}`);
			return;
		}

		const staged = await pi.exec(
			"git",
			["-C", dotfilesDir, "diff", "--cached", "--quiet"],
			{
				signal: ctx.signal,
			},
		);
		if (staged.code === 0) {
			ctx.ui.notify("Pi configuration is already synchronized.", "info");
			return;
		}
		if (staged.code !== 1) {
			notifyError(ctx, `Could not inspect staged Pi changes: ${staged.stderr}`);
			return;
		}

		const commit = await pi.exec(
			"git",
			[
				"-C",
				dotfilesDir,
				"commit",
				"--only",
				"-m",
				"chore(pi): sync configuration",
				"--",
				"pi",
				"scripts/sync-pi-extensions.sh",
			],
			{
				signal: ctx.signal,
			},
		);
		if (commit.code !== 0) {
			notifyError(
				ctx,
				`Could not commit Pi configuration: ${commit.stderr || commit.stdout}`,
			);
			return;
		}

		const push = await pi.exec("git", ["-C", dotfilesDir, "push"], {
			signal: ctx.signal,
		});
		if (push.code !== 0) {
			notifyError(
				ctx,
				`Pi configuration was committed but not pushed: ${push.stderr || push.stdout}`,
			);
			return;
		}

		ctx.ui.notify(
			"Pi configuration was committed and pushed to GitHub.",
			"info",
		);
	};

	const promptToSync = async (ctx) => {
		if (promptOpen) {
			changedWhilePromptOpen = true;
			return;
		}

		promptOpen = true;
		try {
			const confirmed = await ctx.ui.confirm(
				"Pi configuration changed",
				"Sync and push Pi configuration to GitHub?",
			);
			if (confirmed) {
				await syncAndPush(ctx);
			}
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
		watchers.push(
			watch(directory, (_event, name) => {
				if (name && shouldTrack(join(directory, name.toString()))) {
					schedulePrompt(currentContext);
				}
			}),
		);
	};

	let currentContext;

	pi.on("session_start", async (_event, ctx) => {
		if (!ctx.hasUI || !existsSync(syncScript)) return;
		currentContext = ctx;
		watchDirectory(agentDir, (path) => watchedFiles.has(path));
		watchDirectory(npmDir, (path) => watchedFiles.has(path));
		watchDirectory(extensionsDir, () => true);

		// `pi install` reloads resources, which can cancel a file-watch debounce.
		// Compare against the repository snapshot after every session start so that
		// a package/settings update is still offered for synchronization.
		if (await configurationDiffersFromSnapshot()) schedulePrompt(ctx);
	});

	pi.on("session_shutdown", () => {
		clearTimeout(debounceTimer);
		for (const watcher of watchers.splice(0)) watcher.close();
		currentContext = undefined;
	});
}
