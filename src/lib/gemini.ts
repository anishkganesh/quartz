import { GoogleGenAI } from "@google/genai";

// Initialize Google Generative AI client
export const gemini = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || "",
});

// Veo 3.1 model for video generation
export const VEO_MODEL = "veo-3.1-generate-preview";

