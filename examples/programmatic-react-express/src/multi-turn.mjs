import { runClawxTask } from "./clawx.js";

let messages = [];

for (const prompt of [
  "Create calc.js with add and subtract.",
  "Add multiply and divide.",
  "Write tests for calc.js.",
]) {
  console.log(`\n>>> ${prompt}`);
  const result = await runClawxTask({ prompt, messages, stream: true });
  messages = result.messages ?? messages;
}

console.log("\nMulti-turn session complete.");
