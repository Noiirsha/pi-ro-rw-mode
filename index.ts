import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { homedir } from "node:os";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { loadSubagentAPI, registerChildMode } from "./src/subagents.ts";

const WRITE_TOOLS = new Set(["edit", "write"]);
const STATE_ENTRY = "ro-rw-mode-state";
type Mode = "ro" | "rw";

interface PersistedState {
  mode: Mode;
}

export default function roRwModeExtension(pi: ExtensionAPI): void {
  if (process.env.PI_SUBAGENT_CHILD === "1") return;
  let mode: Mode = "rw";
  let toolsBeforeRo: string[] | undefined;
  let requestFooterRender: (() => void) | undefined;
  let subagentAPI: Awaited<ReturnType<typeof loadSubagentAPI>>;
  let childModeRegistration: { dispose(): void } | undefined;

  const syncChildMode = (ctx: ExtensionContext) => {
    childModeRegistration?.dispose();
    childModeRegistration = undefined;
    if (subagentAPI) childModeRegistration = registerChildMode(subagentAPI, ctx.sessionManager.getSessionId(), mode);
  };

  const setStatus = (ctx: ExtensionContext) => {
    ctx.ui.setStatus("ro-rw-mode", undefined);
    requestFooterRender?.();
  };

  const installFooter = (ctx: ExtensionContext) => {
    ctx.ui.setFooter((tui, theme, footerData) => {
      requestFooterRender = () => tui.requestRender();
      const unsubscribe = footerData.onBranchChange(requestFooterRender);
      const format = (n: number) => n < 1000 ? String(n) : n < 1e6 ? `${(n / 1000).toFixed(1)}k` : `${(n / 1e6).toFixed(1)}M`;
      return {
        invalidate() {},
        dispose() { unsubscribe(); requestFooterRender = undefined; },
        render(width: number): string[] {
          if (width <= 0) return [];
          const home = homedir();
          let cwd = ctx.cwd === home ? "~" : ctx.cwd.startsWith(`${home}/`) ? `~${ctx.cwd.slice(home.length)}` : ctx.cwd;
          const branch = footerData.getGitBranch();
          if (branch) cwd += ` (${branch})`;
          const name = ctx.sessionManager.getSessionName();
          if (name) cwd += ` • ${name}`;

          const totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
          let cacheHitRate: number | undefined;
          for (const entry of ctx.sessionManager.getEntries()) {
            const usage = entry.type === "message" && (entry.message.role === "assistant" || entry.message.role === "toolResult")
              ? entry.message.usage
              : "usage" in entry ? entry.usage : undefined;
            if (!usage) continue;
            if (entry.type === "message" && entry.message.role === "assistant") {
              const promptTokens = usage.input + usage.cacheRead + usage.cacheWrite;
              cacheHitRate = promptTokens > 0 ? usage.cacheRead / promptTokens * 100 : undefined;
            }
            totals.input += usage.input;
            totals.output += usage.output;
            totals.cacheRead += usage.cacheRead;
            totals.cacheWrite += usage.cacheWrite;
            totals.cost += usage.cost.total;
          }
          const stats: string[] = [];
          for (const [key, prefix] of [["input", "UP"], ["output", "DN"], ["cacheRead", "CR"], ["cacheWrite", "CW"]] as const) {
            if (totals[key]) stats.push(`${prefix}: ${format(totals[key])}`);
          }
          if (cacheHitRate !== undefined && (totals.cacheRead || totals.cacheWrite)) stats.push(`HIT: ${cacheHitRate.toFixed(1)}%`);
          if (totals.cost) stats.push(`COST: $${totals.cost.toFixed(3)}`);
          const context = ctx.getContextUsage();
          stats.push(`CTX: ${context?.percent == null ? "?" : context.percent.toFixed(1) + "%"}/${format(context?.contextWindow ?? ctx.model?.contextWindow ?? 0)}`);

          const effort = ctx.model?.reasoning ? ` · ${pi.getThinkingLevel()}` : "";
          const badge = theme.inverse(theme.fg(mode === "ro" ? "warning" : "success", mode === "ro" ? " RO " : " RW "));
          // Reserve space for the badge even in narrow terminals.
          const badgeWidth = visibleWidth(badge);
          if (width <= badgeWidth + 1) return [truncateToWidth(badge, width, "")];
          const model = truncateToWidth(ctx.model?.id ?? "no-model", Math.max(0, width - badgeWidth - visibleWidth(effort) - 1), "");
          const right = truncateToWidth(theme.fg("dim", model + effort), width - badgeWidth - 1, "") + " " + badge;
          const left = truncateToWidth(theme.fg("dim", stats.join(" ")), Math.max(0, width - visibleWidth(right) - 2), "");
          const lines = [truncateToWidth(theme.fg("dim", cwd), width), left + " ".repeat(Math.max(0, width - visibleWidth(left) - visibleWidth(right))) + right];
          const statuses = [...footerData.getExtensionStatuses()].filter(([key]) => key !== "ro-rw-mode").sort(([a], [b]) => a.localeCompare(b)).map(([, text]) => text.replace(/[\r\n\t]/g, " "));
          if (statuses.length) lines.push(truncateToWidth(statuses.join(" "), width));
          return lines;
        },
      };
    });
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
    syncChildMode(ctx);
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

  pi.on("before_agent_start", async () => {
    return {
      message: {
        customType: "ro-rw-mode-context",
        content:
          mode === "ro"
            ? "[RO MODE ACTIVE] You are in read-only mode. Do not use edit or write tools, and do not modify files or other state through bash or scripts. Perform only read-only inspection and analysis. If a change is needed, ask the user to switch to RW mode."
            : "[RW MODE ACTIVE] You are in read/write mode. Use the available tools as needed to complete the user's request.",
        display: false,
      },
    };
  });

  pi.on("session_start", async (_event, ctx) => {
    // Background children can discover ambient extensions. Their dedicated child
    // extension owns the launch snapshot; never restore a parent's UI/state here.
    if (process.env.PI_SUBAGENT_CHILD === "1") return;
    subagentAPI = await loadSubagentAPI();
    installFooter(ctx);
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
    syncChildMode(ctx);
  });

  pi.on("session_shutdown", () => {
    childModeRegistration?.dispose();
    childModeRegistration = undefined;
  });
}
