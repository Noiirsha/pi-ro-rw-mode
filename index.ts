import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

const WRITE_TOOLS = new Set(["edit", "write"]);
const STATE_ENTRY = "ro-rw-mode-state";
type Mode = "ro" | "rw";

interface PersistedState {
  mode: Mode;
}

export default function roRwModeExtension(pi: ExtensionAPI): void {
  let mode: Mode = "rw";
  let toolsBeforeRo: string[] | undefined;

  const setStatus = (ctx: ExtensionContext) => {
    const label = mode === "ro" ? " RO " : " RW ";
    const color = mode === "ro" ? "warning" : "success";
    ctx.ui.setStatus("ro-rw-mode", ctx.ui.theme.inverse(ctx.ui.theme.bg(color, label)));
  };

  const persist = () => pi.appendEntry<PersistedState>(STATE_ENTRY, { mode });

  const applyMode = (ctx: ExtensionContext, nextMode: Mode, announce = true) => {
    if (mode === nextMode && toolsBeforeRo !== undefined) {
      setStatus(ctx);
      return;
    }

    if (nextMode === "ro") {
      if (mode !== "ro") toolsBeforeRo = pi.getActiveTools();
      pi.setActiveTools((toolsBeforeRo ?? pi.getActiveTools()).filter((name) => !WRITE_TOOLS.has(name)));
    } else {
      pi.setActiveTools(toolsBeforeRo ?? pi.getActiveTools());
      toolsBeforeRo = undefined;
    }

    mode = nextMode;
    setStatus(ctx);
    persist();

    if (announce) {
      ctx.ui.notify(mode === "ro" ? "RO mode enabled" : "RW mode enabled", "info");
      pi.sendMessage(
        {
          customType: "ro-rw-mode",
          content:
            mode === "ro"
              ? "Mode changed: RO (read-only). Only inspect and analyze the project. Do not edit or write files. If the user asks for a change, tell them to switch to RW mode first."
              : "Mode changed: RW (read/write). You may use the available tools to make changes as requested.",
          display: false,
        },
        { triggerTurn: false, deliverAs: "nextTurn" },
      );
    }
  };

  const toggle = async (_args: string, ctx: ExtensionContext) => {
    applyMode(ctx, mode === "ro" ? "rw" : "ro");
  };

  pi.registerCommand("ro", {
    description: "Switch to read-only mode",
    handler: async (_args, ctx) => applyMode(ctx, "ro"),
  });
  pi.registerCommand("rw", {
    description: "Switch to read/write mode",
    handler: async (_args, ctx) => applyMode(ctx, "rw"),
  });
  pi.registerCommand("mode", {
    description: "Toggle between RO and RW modes",
    handler: toggle,
  });

  pi.on("before_agent_start", async (event) => {
    if (event.messageType !== "user") return;
    return {
      message: {
        customType: "ro-rw-mode-context",
        content:
          mode === "ro"
            ? "[RO MODE ACTIVE] You are in read-only mode. Do not use edit or write tools, and do not modify files. Perform only read-only inspection and analysis. If a change is needed, ask the user to switch to RW mode."
            : "[RW MODE ACTIVE] You are in read/write mode. Use the available tools as needed to complete the user's request.",
        display: false,
      },
    };
  });

  pi.on("session_start", async (_event, ctx) => {
    const entries = ctx.sessionManager.getEntries();
    const saved = [...entries]
      .reverse()
      .find((entry) => entry.type === "custom" && entry.customType === STATE_ENTRY) as
      | { data?: PersistedState }
      | undefined;
    if (saved?.data?.mode) mode = saved.data.mode;
    if (mode === "ro") {
      toolsBeforeRo = pi.getActiveTools();
      pi.setActiveTools(toolsBeforeRo.filter((name) => !WRITE_TOOLS.has(name)));
    }
    setStatus(ctx);
  });
}
