# pi_ro_rw_mode

A small Pi coding-agent extension that provides read-only (`RO`) and read/write (`RW`) modes.

- `/ro` switches to read-only mode and hides the built-in `edit` and `write` tools.
- `/rw` restores the tool set that was active before entering RO mode.
- `/mode` toggles between the two modes.
- The current mode is shown in the TUI status area and is included in the model context.

This extension intentionally uses tool visibility and prompt guidance. It does not sandbox arbitrary shell commands.

## Install

Copy `index.ts` into `~/.pi/agent/extensions/`:

```sh
mkdir -p ~/.pi/agent/extensions
cp index.ts ~/.pi/agent/extensions/ro-rw-mode.ts
```

Or load it for one run:

```sh
pi -e /absolute/path/to/pi_ro_rw_mode/index.ts
```

Use `/ro`, `/rw`, or `/mode` inside Pi. Use `/reload` after changing the extension.
