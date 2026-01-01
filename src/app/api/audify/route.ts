import { NextRequest, NextResponse } from "next/server";
import { textToSpeech, VOICES } from "@/lib/elevenlabs";

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

    // ElevenLabs has a higher character limit, but let's be reasonable
    if (textToSpeak.length > 10000) {
      textToSpeak = textToSpeak.slice(0, 10000) + "...";
    }

    // Generate speech using ElevenLabs
    const audioBuffer = await textToSpeech({
      text: textToSpeak,
      voiceId: VOICES.narrator,
    });

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
      { error: "Failed to generate audio" },
      { status: 500 }
    );
  }
}
