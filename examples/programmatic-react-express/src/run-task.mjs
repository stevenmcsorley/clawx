import { runClawxTask } from "./clawx.js";

const prompt = process.argv.slice(2).join(" ") || "List the files in the current directory and summarize this project";

const result = await runClawxTask({ prompt, stream: true });

console.log("\n--- result ---");
console.log(JSON.stringify({
  aborted: result.aborted ?? false,
  messageCount: result.messages?.length ?? 0,
}, null, 2));
