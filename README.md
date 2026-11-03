# pi_ro_rw_mode

A small Pi coding-agent extension that provides read-only (`RO`) and read/write (`RW`) modes.

- `/ro` switches to read-only mode and hides the built-in `edit` and `write` tools.
- `/rw` restores the tool set that was active before entering RO mode.
- `/mode` toggles between the two modes.
- The current mode is shown immediately after the model name and thinking effort in a custom TUI footer, and is included in the model context.
- The custom footer retains directory, branch, usage, context and other extension statuses. Other extensions that replace the footer may override this layout.

This extension intentionally uses tool visibility and prompt guidance. It does not sandbox arbitrary shell commands.

Footer usage labels: `UP` (input tokens), `DN` (output tokens), `CR` (cache read), `CW` (cache write), `HIT` (latest response's cache read / total prompt tokens), `COST` (total USD cost), and `CTX` (context usage / capacity). Zero usage counters are omitted.

## Install

Install the complete directory as a local Pi package (the `src/` files are required):

```sh
pi install /absolute/path/to/pi_ro_rw_mode
```

Or load it for one run:

```sh
pi -e /absolute/path/to/pi_ro_rw_mode/index.ts
```

Use `/ro`, `/rw`, or `/mode` inside Pi. Use `/reload` after changing the extension.

## Subagents

Integrates with `nicobailon/pi-subagents` through its public `required-child-extensions` API. It resolves an installed package first, or a sibling `../pi-subagents` source checkout. The tested upstream checkout is version 0.84.0. Older releases without this API are not supported.

At launch, a local native Pi child receives an immutable RO or RW extension. RO hides `edit`/`write` and appends read-only system guidance on each agent start; bash remains available and follows that guidance. RW preserves the child's configured tools. Nested/background children inherit the extension snapshot. The main UI extension does not initialize inside background children.

Changing the parent mode affects new launches only. Steering an existing child or resuming its retained session keeps the original mode; launch a fresh child to use a different mode. The upstream resume contract retains its original required-extension snapshot, so per-follow-up permission changes are not implemented. External CLI and remote runners cannot load this extension and are rejected in RO by the required-extension API; RW adds no such restriction.

When `pi-subagents` is absent, ordinary RO/RW mode remains available. Do not copy only `index.ts`, or load both the old standalone file and the package directory.

## Validation

With a sibling upstream source checkout and the installed Pi runtime:

```sh
PI_NODE_MODULES=/path/to/pi/runtime/node_modules node test/subagents.mjs
```

This checks the real upstream registration API, launch snapshot isolation, RO/RW child hooks, session separation, and cleanup without making model requests. It is not an end-to-end model delegation test.
