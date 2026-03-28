import type { Schema } from "@google/generative-ai";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import type { AiStructuredProvider, StructuredJsonRequest } from "./ai.provider.js";

export type GeminiGenerateInput = StructuredJsonRequest;

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
      operationType: { type: SchemaType.STRING },
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
    const modelName = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
    const model = this.client.getGenerativeModel({
      model: modelName,
      systemInstruction: input.systemInstruction,
    });

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
  }
}
