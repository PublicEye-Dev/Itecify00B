import type { Schema } from "@google/generative-ai";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import type { AiStructuredProvider, StructuredJsonRequest } from "./ai.provider.js";

export type GeminiGenerateInput = StructuredJsonRequest;

/**
 * Cheie API compatibilă cu iTECify (`GEMINI_API_KEY`) și cu proiecte Nest / alte servicii (`GOOGLE_GEN_AI_API_KEY`).
 * Prima valoare nevidă câștigă.
 */
export function resolveGeminiApiKey(): string | undefined {
  const gemini = process.env.GEMINI_API_KEY?.trim();
  if (gemini) return gemini;
  return process.env.GOOGLE_GEN_AI_API_KEY?.trim();
}

function buildResponseSchema(): Schema {
  const targetRange: Schema = {
    type: SchemaType.OBJECT,
    properties: {
      startLineNumber: { type: SchemaType.INTEGER },
      startColumn: { type: SchemaType.INTEGER },
      endLineNumber: { type: SchemaType.INTEGER },
      endColumn: { type: SchemaType.INTEGER },
    },
    required: ["startLineNumber", "startColumn", "endLineNumber", "endColumn"],
  };

  const suggestionItem: Schema = {
    type: SchemaType.OBJECT,
    properties: {
      filePath: { type: SchemaType.STRING },
      operationType: {
        type: SchemaType.STRING,
        format: "enum",
        enum: ["REPLACE", "INSERT", "DELETE"],
      },
      targetRange,
      replacementText: { type: SchemaType.STRING },
      explanation: { type: SchemaType.STRING },
      confidence: { type: SchemaType.NUMBER },
    },
    required: [
      "filePath",
      "operationType",
      "targetRange",
      "replacementText",
      "explanation",
      "confidence",
    ],
  };

  return {
    type: SchemaType.OBJECT,
    properties: {
      suggestions: {
        type: SchemaType.ARRAY,
        items: suggestionItem,
      },
    },
    required: ["suggestions"],
  };
}

export class GeminiAdapter implements AiStructuredProvider {
  private readonly client: GoogleGenerativeAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenerativeAI(apiKey);
  }

  async generateStructuredJson(input: GeminiGenerateInput): Promise<string> {
    /**
     * Implicit aliniat cu integrări care folosesc `gemini-2.5-flash` (Google AI Studio).
     * Suprascrie cu GEMINI_MODEL dacă ai nevoie de alt bucket de cotă sau model.
     */
    const modelName = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
    const model = this.client.getGenerativeModel({
      model: modelName,
      systemInstruction: input.systemInstruction,
    });

    const devLog =
      process.env.NODE_ENV !== "production" && process.env.AI_DEBUG_LOG !== "0";
    if (devLog) {
      console.debug("[itecify][gemini] generateStructuredJson", { model: modelName });
    }

    try {
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: input.userPrompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 8192,
          responseMimeType: "application/json",
          responseSchema: buildResponseSchema(),
        },
      });

      const text = result.response.text();
      if (!text || !text.trim()) {
        throw new Error("Gemini returned empty body.");
      }
      return text.trim();
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      if (
        raw.includes("429") ||
        raw.includes("Too Many Requests") ||
        raw.includes("Quota exceeded") ||
        raw.includes("RESOURCE_EXHAUSTED")
      ) {
        throw new Error(
          [
            "GEMINI_QUOTA:",
            "Cotă Gemini depășită sau limită free tier pentru acest model.",
            "Opțiuni: așteaptă cooldown-ul indicat în mesajul Google, setează GEMINI_MODEL",
            "(ex. gemini-2.0-flash-lite, gemini-1.5-flash) în .env, sau activează facturarea în Google AI Studio.",
          ].join(" "),
        );
      }
      throw err instanceof Error ? err : new Error(String(err));
    }
  }
}
