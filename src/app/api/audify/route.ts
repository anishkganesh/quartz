import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { getCachedAudio, cacheAudio, normalizeTopic } from "@/lib/server-cache";

export async function POST(request: NextRequest) {
  try {
    const { topic, content, simplificationLevel = 0 } = await request.json();

    if (!topic && !content) {
      return NextResponse.json(
        { error: "Topic or content is required" },
        { status: 400 }
      );
    }

    const normalizedTopicStr = topic ? normalizeTopic(topic) : "";

    // Check cache first (only if we have a topic)
    if (normalizedTopicStr) {
      const cachedAudioUrl = await getCachedAudio(normalizedTopicStr, simplificationLevel);
      if (cachedAudioUrl) {
        // Return cached audio URL as JSON (frontend will fetch the URL)
        return NextResponse.json({ 
          audioUrl: cachedAudioUrl, 
          cached: true 
        });
      }
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

    // OpenAI TTS has a 4096 character limit
    if (textToSpeak.length > 4000) {
      textToSpeak = textToSpeak.slice(0, 4000) + "...";
    }

    console.log("Audify: Generating audio with OpenAI TTS");
    const mp3Response = await openai.audio.speech.create({
      model: "tts-1",
      voice: "nova",
      input: textToSpeak,
    });
    const audioBuffer = await mp3Response.arrayBuffer();

    // Cache the audio if we have a topic
    if (normalizedTopicStr) {
      const cachedUrl = await cacheAudio(normalizedTopicStr, simplificationLevel, audioBuffer);
      if (cachedUrl) {
        // Return the cached URL
        return NextResponse.json({ 
          audioUrl: cachedUrl, 
          cached: false 
        });
      }
    }

    // Fallback: Return the audio as a response (not cached)
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
