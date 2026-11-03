import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

interface Registration { dispose(): void }
interface ChildExtensionAPI {
  registerRequiredChildExtensions(input: {
    sessionId: string;
    extensions: { id: string; path: string }[];
    requireForAllRunners: boolean;
  }): Registration;
}

// Prefer the installed public API; also support a sibling source checkout.
export async function loadSubagentAPI(): Promise<ChildExtensionAPI | undefined> {
  let modulePath: string;
  try {
    modulePath = createRequire(import.meta.url).resolve("pi-subagents/required-child-extensions");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "MODULE_NOT_FOUND") throw error;
    modulePath = fileURLToPath(new URL("../../pi-subagents/src/api/required-child-extensions.ts", import.meta.url));
    if (!existsSync(modulePath)) return undefined;
  }
  return await import(pathToFileURL(modulePath).href) as ChildExtensionAPI;
}

export function registerChildMode(api: ChildExtensionAPI, sessionId: string, mode: "ro" | "rw"): Registration {
  return api.registerRequiredChildExtensions({
    sessionId,
    extensions: [{ id: "ro-rw-mode", path: fileURLToPath(new URL(`./child-${mode}.ts`, import.meta.url)) }],
    requireForAllRunners: mode === "ro",
  });
}
