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

## Plan workflow

The stack includes `@dreki-gg/pi-plan-mode` and its `@dreki-gg/pi-subagent`
companion. Start a two-phase plan with `/plan <prompt>` (or `pi --plan`), then
choose execution, refinement, or follow-up. Plans and handoff prompts are stored in
`.taskman/plans/`; use `/workflow <task>` when a reviewed background subagent
workflow is appropriate.

## Restore on a new machine

Run `chezmoi apply` to restore `dot_pi/agent/` into `~/.pi/agent/`, then
install the locked extension dependencies:

```sh
(cd ~/.pi/agent/npm && npm ci --omit=dev)
```

Authenticate separately with Pi after restoring the configuration.
