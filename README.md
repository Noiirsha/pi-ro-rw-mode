# pi_ro_rw_mode

A small Pi coding-agent extension that provides read-only (`RO`) and read/write (`RW`) modes.

- `/ro` switches to read-only mode and hides the built-in `edit` and `write` tools.
- `/rw` restores only the write tools hidden by RO, preserving tools added by other extensions.
- `/mode` toggles between the two modes.
- The current mode is shown immediately after the model name and thinking effort in a custom TUI footer, and is included in the model context.
- The custom footer retains directory, branch, usage, context and other extension statuses. Other extensions that replace the footer may override this layout.

This extension intentionally uses tool visibility and prompt guidance. It does not sandbox arbitrary shell commands.

Footer usage labels: `UP` (input tokens), `DN` (output tokens), `CR` (cache read), `CW` (cache write), `HIT` (latest response's cache read / total prompt tokens), `COST` (total USD cost), and `CTX` (context usage / capacity). Zero usage counters are omitted.

## Install

Install the complete directory as a local Pi package:

```sh
pi install /absolute/path/to/pi_ro_rw_mode
```

Or load it for one run:

```sh
pi -e /absolute/path/to/pi_ro_rw_mode/index.ts
```

Use `/ro`, `/rw`, or `/mode` inside Pi. Use `/reload` after changing the extension.

## Light subagents

This plugin does not depend on a subagent package. Extensions can query the current session's mode synchronously using Pi's session event bus:

```ts
const query: { mode?: "ro" | "rw" } = {};
pi.events.emit("ro-rw-mode:get", query);
// query.mode is now the active mode, if this extension is loaded.
```

`pi_light_subagent` captures this mode at launch. Existing children keep their captured mode. No third-party adapter, child extension injection, or subagent runtime is included here.

Write tools hidden by RO are persisted with the mode. Switching back to RW merges those tools into the current active selection instead of restoring a stale whole-tool-list snapshot. Modes are restored from the current session branch. Current-mode guidance is supplied through the system prompt; obsolete plugin reminders are filtered from model context.
