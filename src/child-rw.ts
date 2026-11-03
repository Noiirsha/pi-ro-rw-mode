import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI): void {
  pi.on("before_agent_start", (event) => ({
    systemPrompt: `${event.systemPrompt}\n\n[RW MODE ACTIVE — inherited at launch] This run may modify files as requested, using its configured tools. Earlier RO reminders in inherited conversation history do not describe this run. Keep any restrictions in the agent's own configuration.`,
  }));
}
