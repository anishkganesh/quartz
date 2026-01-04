// ElevenLabs TTS Configuration

export const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

// Voice IDs for different use cases
// These are ElevenLabs voice IDs - you can find more at https://elevenlabs.io/voice-library
export const VOICES = {
  // For article narration - clear, professional
  narrator: "21m00Tcm4TlvDq8ikWAM", // Rachel - calm, clear female voice
  
  // For podcast - conversational voices
  host: "ErXwobaYiN019PkySvjV", // Antoni - warm male voice
  guest: "MF3mGyEYCl7XYWbV9V6O", // Elli - friendly female voice
} as const;

export type VoiceId = typeof VOICES[keyof typeof VOICES];

// ElevenLabs API endpoint
const ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1";

// Model options
export const MODELS = {
  turbo: "eleven_turbo_v2_5", // Fastest, good quality
  multilingual: "eleven_multilingual_v2", // Best quality, supports multiple languages
} as const;

interface TextToSpeechOptions {
  text: string;
  voiceId: VoiceId;
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
}

/**
 * Generate speech from text using ElevenLabs API
 * Returns audio as ArrayBuffer
 */
export async function textToSpeech({
  text,
  voiceId,
  modelId = MODELS.turbo,
  stability = 0.5,
  similarityBoost = 0.75,
}: TextToSpeechOptions): Promise<ArrayBuffer> {
  if (!ELEVENLABS_API_KEY) {
    throw new Error("ELEVENLABS_API_KEY is not configured");
  }

  const response = await fetch(
    `${ELEVENLABS_API_URL}/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": ELEVENLABS_API_KEY,
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: {
          stability,
          similarity_boost: similarityBoost,
        },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ElevenLabs API error: ${response.status} - ${error}`);
  }

  return response.arrayBuffer();
}

/**
 * Generate speech and return as streaming response
 * For faster time-to-first-byte
 */
export async function textToSpeechStream({
  text,
  voiceId,
  modelId = MODELS.turbo,
  stability = 0.5,
  similarityBoost = 0.75,
}: TextToSpeechOptions): Promise<ReadableStream<Uint8Array>> {
  if (!ELEVENLABS_API_KEY) {
    throw new Error("ELEVENLABS_API_KEY is not configured");
  }

  const response = await fetch(
    `${ELEVENLABS_API_URL}/text-to-speech/${voiceId}/stream`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": ELEVENLABS_API_KEY,
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: {
          stability,
          similarity_boost: similarityBoost,
        },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ElevenLabs API error: ${response.status} - ${error}`);
  }

  if (!response.body) {
    throw new Error("No response body");
  }

  return response.body;
}


