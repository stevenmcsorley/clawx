import { runClawxTask } from "./clawx.js";

const result = await runClawxTask({
  prompt: "Inspect the current workspace, list the main files, and provide a concise project summary.",
  stream: true,
});

console.log("\nDone:", result.aborted ? "aborted" : "completed");
