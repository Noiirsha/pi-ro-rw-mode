import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { homedir } from "node:os";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

const WRITE_TOOLS = new Set(["edit", "write"]);
const STATE_ENTRY = "ro-rw-mode-state";
type Mode = "ro" | "rw";

interface PersistedState {
  mode: Mode;
}

export default function roRwModeExtension(pi: ExtensionAPI): void {
  let mode: Mode = "rw";
  let requestFooterRender: (() => void) | undefined;
  const unsubscribeMode = pi.events.on("ro-rw-mode:get", (request) => {
    if (request && typeof request === "object") (request as { mode?: Mode }).mode = mode;
  });

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

  // Derive write availability from the current registry, never a historical
  // active-tool snapshot: reload/resume can replay RO's removals into RW.
  const reconcileTools = () => {
    const active = pi.getActiveTools();
    const writes = pi.getAllTools().filter(tool => WRITE_TOOLS.has(tool.name) && tool.exposure !== "hidden").map(tool => tool.name);
    const next = mode === "ro"
      ? active.filter(name => !WRITE_TOOLS.has(name))
      : [...new Set([...active, ...writes])];
    if (next.length !== active.length || next.some((name, i) => name !== active[i])) pi.setActiveTools(next);
  };
  const persist = () => pi.appendEntry<PersistedState>(STATE_ENTRY, { mode });

  const applyMode = (ctx: ExtensionContext, nextMode: Mode, announce = true) => {
    mode = nextMode;
    reconcileTools();
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

  pi.on("context", (event) => ({
    messages: event.messages.filter((message) => !(message.role === "custom" &&
      ["ro-rw-mode", "ro-rw-mode-context"].includes(message.customType))),
  }));
  pi.on("before_agent_start", (event) => ({
    systemPrompt: event.systemPrompt + "\n\n" + (mode === "ro"
      ? "[RO MODE ACTIVE] Only inspect and analyze. Do not modify files or other state, including through bash or scripts. If changes are needed, tell the user to switch to RW."
      : "[RW MODE ACTIVE] Use the available tools to complete the user's request. Earlier RO instructions from this mode plugin no longer apply."),
  }));

  const restoreMode = (ctx: ExtensionContext) => {
    const entries = ctx.sessionManager.getBranch();
    const saved = [...entries]
      .reverse()
      .find((entry) => entry.type === "custom" && entry.customType === STATE_ENTRY) as
      | { data?: PersistedState }
      | undefined;
    mode = saved?.data?.mode ?? "rw";
    reconcileTools();
    setStatus(ctx);
  };
  pi.on("session_start", (_event, ctx) => {
    installFooter(ctx);
    restoreMode(ctx);
  });
  pi.on("session_tree", (_event, ctx) => restoreMode(ctx));

  pi.on("session_shutdown", () => {
    unsubscribeMode();
  });
}
