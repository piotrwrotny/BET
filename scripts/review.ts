import "dotenv/config";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { Output, stepCountIs, ToolLoopAgent } from "ai";
import { buildReviewPrompt, REVIEW_SCHEMA, SYSTEM_PROMPT, type Review } from "../agents/review-schema.js";

const providerName = process.env.LLM_PROVIDER ?? "gucio";

const baseURL =
  process.env.LLM_BASE_URL ??
  (providerName === "openrouter" ? "https://openrouter.ai/api/v1" : "http://gucio-kimi-k27-code.llm.ai.asseco.pl/v1");

const apiKey =
  process.env.LLM_API_KEY ??
  (providerName === "openrouter" ? process.env.OPENROUTER_API_KEY : process.env.GUCIO_API_KEY);

const modelId =
  process.env.LLM_MODEL ?? (providerName === "openrouter" ? "moonshotai/Kimi-K2.7-Code" : "moonshotai/Kimi-K2.7-Code");

if (!apiKey) {
  console.error("Brakuje klucza API. Ust jedną ze zmiennych: LLM_API_KEY, OPENROUTER_API_KEY lub GUCIO_API_KEY.");
  process.exit(1);
}

const provider = createOpenAICompatible({
  name: providerName,
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
  if (process.env.DIFF) {
    return process.env.DIFF;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function review(diff: string): Promise<Review> {
  const prompt = buildReviewPrompt(diff, process.env.PR_TITLE, process.env.PR_BODY);
  const { output, usage } = await reviewer.generate({ prompt });
  console.error(`Usage: ${usage.inputTokens} input / ${usage.outputTokens} output tokens`);
  return output;
}

const diff = await readDiff();
if (!diff.trim()) {
  console.error("Brak diffa. Ustaw DIFF lub przekaż przez stdin.");
  process.exit(1);
}

const result = await review(diff);
console.log(JSON.stringify(result, null, 2));
