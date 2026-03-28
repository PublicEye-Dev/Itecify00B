/**
 * Contract pentru orice furnizor care returnează JSON text (validat apoi cu Zod).
 * Implementare curentă: {@link GeminiAdapter}.
 */
export type StructuredJsonRequest = {
  systemInstruction: string;
  userPrompt: string;
};

export interface AiStructuredProvider {
  generateStructuredJson(input: StructuredJsonRequest): Promise<string>;
}
