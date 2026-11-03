import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const guidance = "[RO MODE ACTIVE — inherited at launch] This run is read-only. Only inspect and analyze. Do not modify files or other state, including through bash, scripts, or other tools. If changes are required, tell the supervisor to switch to RW and launch a new run. Do not bypass unavailable edit/write tools. This run retains RO even if the supervisor changes modes.";

// A dedicated immutable child extension: no footer, commands, or parent state.
export default function (pi: ExtensionAPI): void {
  const hideWrites = () => pi.setActiveTools(pi.getActiveTools().filter((name) => name !== "edit" && name !== "write"));
  pi.on("session_start", hideWrites);
  pi.on("before_agent_start", (event) => {
    hideWrites();
    return { systemPrompt: `${event.systemPrompt}\n\n${guidance}` };
  });
}
