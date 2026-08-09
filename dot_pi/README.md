# Pi configuration

This directory snapshots the Pi extensions and extension settings from
`~/.pi/agent`.

## Refresh the snapshot

Run this from the chezmoi source directory whenever Pi extensions are added,
removed, or updated:

```sh
./scripts/sync-pi-extensions.sh
```

The script intentionally excludes credentials, model caches, sessions, installed
packages, other machine-local state, and Herdr's generated integration extension.
Herdr recreates that extension when installed on a machine.

## Planning and task workflow

`pi-herdr-subagents` provides the `/plan` workflow and asynchronous Herdr-backed
subagents. `@juicesharp/rpiv-todo` keeps the current task list visible across
reloads and compaction; use `/todos` to view it. The stack also includes Pi Lens,
Pi Add Dir, and Pi GPT Search.

## Restore on a new machine

Run `chezmoi apply` to restore `dot_pi/agent/` into `~/.pi/agent/`, then
install the locked extension dependencies:

```sh
(cd ~/.pi/agent/npm && npm ci --omit=dev)
```

Authenticate separately with Pi after restoring the configuration.
