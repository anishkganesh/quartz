import { NextRequest, NextResponse } from "next/server";
import { textToSpeech, VOICES, ELEVENLABS_API_KEY } from "@/lib/elevenlabs";
import { openai } from "@/lib/openai";

export async function POST(request: NextRequest) {
  try {
    const { topic, content } = await request.json();

    if (!topic && !content) {
      return NextResponse.json(
        { error: "Topic or content is required" },
        { status: 400 }
      );
    }

    // Prepare text for TTS - remove markdown formatting and concept brackets
    let textToSpeak = content || `An article about ${topic}`;
    
    // Clean up the text
    textToSpeak = textToSpeak
      .replace(/\[\[([^\]]+)\]\]/g, "$1") // Remove [[ ]] brackets
      .replace(/#{1,6}\s*/g, "") // Remove headings markers
      .replace(/\*\*([^*]+)\*\*/g, "$1") // Remove bold
      .replace(/\*([^*]+)\*/g, "$1") // Remove italic
      .replace(/`([^`]+)`/g, "$1") // Remove code
      .replace(/\n{3,}/g, "\n\n") // Normalize line breaks
      .trim();

    let audioBuffer: ArrayBuffer;

    // Try ElevenLabs first, fall back to OpenAI if not configured
    if (ELEVENLABS_API_KEY) {
      console.log("Audify: Using ElevenLabs TTS");
      // ElevenLabs has a higher character limit
      if (textToSpeak.length > 10000) {
        textToSpeak = textToSpeak.slice(0, 10000) + "...";
      }
      audioBuffer = await textToSpeech({
        text: textToSpeak,
        voiceId: VOICES.narrator,
      });
    } else {
      console.log("Audify: ElevenLabs not configured, using OpenAI TTS");
      // OpenAI has a 4096 character limit
      if (textToSpeak.length > 4000) {
        textToSpeak = textToSpeak.slice(0, 4000) + "...";
      }
      const mp3Response = await openai.audio.speech.create({
        model: "tts-1",
        voice: "nova",
        input: textToSpeak,
      });
      audioBuffer = await mp3Response.arrayBuffer();
    }

    // Return the audio as a response
    return new NextResponse(audioBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": audioBuffer.byteLength.toString(),
      },
    });
  } catch (error) {
    console.error("Audify error:", error);
    return NextResponse.json(
      { error: "Failed to generate audio", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
