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
packages, other machine-local state, and Herdr's generated `herdr-agent-state.ts`
integration. Herdr recreates that file when installed on a machine. The Herdr
auto-title hook (`herdr-auto-title.ts`) is snapshotted; it no-ops on machines
without the Herdr generator.

## Extensions

`pi-herdr-agents` provides asynchronous Herdr-backed subagents and approved
review workflows, including `/plan`. `@narumitw/pi-btw` opens side-thread
questions via `/btw` without derailing the main task. `@upstash/context7-pi`
adds up-to-date library documentation lookups (`/c7-docs`). The stack also
includes Pi Lens (diagnostics and code intelligence), Pi Add Dir, Pi GPT Search
(web search for any model), the OpenCode provider bridge, and Pi Redact All
(secret/PII redaction across tool outputs).

## Restore on a new machine

Run `chezmoi apply` to restore `dot_pi/agent/` into `~/.pi/agent/`, then
install the locked extension dependencies:

```sh
(cd ~/.pi/agent/npm && npm ci --omit=dev)
```

Authenticate separately with Pi after restoring the configuration.
