import "dotenv/config";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { Output, stepCountIs, ToolLoopAgent } from "ai";
import { buildReviewPrompt, REVIEW_SCHEMA, SYSTEM_PROMPT, type Review } from "../agents/review-schema.js";

const providerName = process.env.LLM_PROVIDER ?? "gucio";

const baseURL =
  process.env.LLM_BASE_URL ??
  (providerName === "openrouter"
    ? "https://openrouter.ai/api/v1"
    : providerName === "github"
      ? "https://models.github.ai/inference"
      : "http://gucio-kimi-k27-code.llm.ai.asseco.pl/v1");

const apiKey =
  process.env.LLM_API_KEY ??
  (providerName === "openrouter"
    ? process.env.OPENROUTER_API_KEY
    : providerName === "github"
      ? process.env.GITHUB_TOKEN
      : process.env.GUCIO_API_KEY);

const modelId =
  process.env.LLM_MODEL ??
  (providerName === "openrouter"
    ? "moonshotai/Kimi-K2.7-Code"
    : providerName === "github"
      ? "openai/gpt-4.1-mini"
      : "moonshotai/Kimi-K2.7-Code");

if (!apiKey) {
  console.error("Brakuje klucza API. Ustaw LLM_API_KEY (lub GUCIO_API_KEY / OPENROUTER_API_KEY / GITHUB_TOKEN).");
  process.exit(1);
}

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

async function reviewWithSDK(diff: string): Promise<Review> {
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

  const prompt = buildReviewPrompt(diff, process.env.PR_TITLE, process.env.PR_BODY);
  const { output, usage } = await reviewer.generate({ prompt });
  console.error(`Usage: ${usage.inputTokens} input / ${usage.outputTokens} output tokens`);
  return output;
}

async function reviewWithGitHubModels(diff: string): Promise<Review> {
  const prompt = buildReviewPrompt(diff, process.env.PR_TITLE, process.env.PR_BODY);
  const response = await fetch(`${baseURL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2026-03-10",
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub Models API error ${response.status}: ${text}`);
  }

  const body = (await response.json()) as {
    choices: [{ message: { content: string } }];
    usage?: { prompt_tokens: number; completion_tokens: number };
  };
  const content = body.choices[0].message.content;
  const usage = body.usage;
  if (usage) {
    console.error(`Usage: ${usage.prompt_tokens} input / ${usage.completion_tokens} output tokens`);
  }
  return REVIEW_SCHEMA.parse(JSON.parse(content));
}

const diff = await readDiff();
if (!diff.trim()) {
  console.error("Brak diffa. Ustaw DIFF lub przekaż przez stdin.");
  process.exit(1);
}

const result = providerName === "github" ? await reviewWithGitHubModels(diff) : await reviewWithSDK(diff);
console.log(JSON.stringify(result, null, 2));
