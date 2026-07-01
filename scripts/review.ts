import "dotenv/config";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { Output, stepCountIs, ToolLoopAgent } from "ai";
import { REVIEW_SCHEMA, SYSTEM_PROMPT, type Review } from "../agents/review-schema.js";

const baseURL = process.env.GUCIO_BASE_URL ?? "http://gucio-kimi-k27-code.llm.ai.asseco.pl/v1";
const apiKey = process.env.GUCIO_API_KEY;
const modelId = process.env.GUCIO_MODEL ?? "moonshotai/Kimi-K2.7-Code";

if (!apiKey) {
  console.error("Brakuje zmiennej środowiskowej GUCIO_API_KEY");
  process.exit(1);
}

const provider = createOpenAICompatible({
  name: "gucio",
  baseURL,
  apiKey,
});

const reviewer = new ToolLoopAgent({
  model: provider.chatModel(modelId),
  instructions: SYSTEM_PROMPT,
  tools: {},
  output: Output.object({ schema: REVIEW_SCHEMA }),
  stopWhen: stepCountIs(2),
});

async function readDiff(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function review(diff: string): Promise<Review> {
  const { output, usage } = await reviewer.generate({
    prompt: `Zrecenzuj ten diff:\n\n${diff}`,
  });

  console.error(`Usage: ${usage.inputTokens} input / ${usage.outputTokens} output tokens`);

  return output;
}

const diff = await readDiff();
if (!diff.trim()) {
  console.error("Brak diffa na stdin. Użyj: git diff | npx tsx scripts/review.ts");
  process.exit(1);
}

const result = await review(diff);
console.log(JSON.stringify(result, null, 2));
