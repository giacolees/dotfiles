# Pi configuration

This directory snapshots the Pi extensions and extension settings from
`~/.pi/agent`.

## Refresh the snapshot

Run this from the repository root whenever Pi extensions are added,
removed, or updated:

```sh
./scripts/sync-pi-extensions.sh
```

The script intentionally excludes credentials, model caches, sessions, installed
packages, other machine-local state, and Herdr's generated integration extension.
Herdr recreates that extension when installed on a machine.

## Automatic GitHub updates

The `sync-dotfiles-on-pi-change` extension watches Pi settings, package manifests,
and top-level extension files. After a change, it asks whether to synchronize,
commit, and push only the Pi configuration to GitHub. It does not stage unrelated
dotfiles changes.

The extension expects this repository at `~/dotfiles`. Set `PI_DOTFILES_REPO` to
use another checkout location. Restart Pi or run `/reload` after installing the
extension. Pi package installation reloads resources, so the extension also compares
the active configuration with this snapshot after startup; this prevents the reload
from suppressing the confirmation prompt.

## Restore on a new machine

Copy `pi/agent/` into `~/.pi/agent/`, then install the locked extension
dependencies:

```sh
mkdir -p ~/.pi/agent
rsync -a --exclude 'auth.json' --exclude 'models-store.json' \
  --exclude 'sessions/' pi/agent/ ~/.pi/agent/
(cd ~/.pi/agent/npm && npm ci --omit=dev)
```

Authenticate separately with Pi after restoring the configuration.
