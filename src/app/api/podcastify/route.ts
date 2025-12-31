import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";

export const maxDuration = 120; // 2 minutes for audio generation

interface DialogueLine {
  speaker: "Host" | "Guest";
  text: string;
}

export async function POST(request: NextRequest) {
  try {
    const { topic, content } = await request.json();

    if (!topic) {
      return NextResponse.json(
        { error: "Topic is required" },
        { status: 400 }
      );
    }

    console.log("Podcastify: Generating dialogue script...");

    // Step 1: Generate dialogue script
    const apiResponse = await openai.responses.create({
      model: "gpt-5.2",
      input: [
        {
          role: "system",
          content: `You are a podcast script writer. Generate an engaging two-person conversation between a Host and a Guest Expert about the topic.

Rules:
- Host asks curious, thoughtful questions that a listener might have
- Guest explains concepts clearly with analogies and examples
- Keep the conversation natural and flowing
- Include moments of surprise, humor, or "aha!" revelations
- Make complex topics accessible
- Each speaker turn should be 1-3 sentences

Output ONLY valid JSON in this exact format:
{
  "dialogue": [
    {"speaker": "Host", "text": "..."},
    {"speaker": "Guest", "text": "..."},
    ...
  ]
}

Generate 8-10 exchanges (16-20 lines total) to keep audio generation manageable.`,
        },
        {
          role: "user",
          content: `Create a podcast conversation about "${topic}". Use this content as reference:\n\n${content?.slice(0, 2000) || "Generate from the topic name"}`,
        },
      ],
      reasoning: { effort: "none" },
      temperature: 0.85,
      max_output_tokens: 1500,
    });

    const response = apiResponse.output_text;

    if (!response) {
      return NextResponse.json(
        { error: "Failed to generate podcast script" },
        { status: 500 }
      );
    }

    console.log("Podcastify: Dialogue script generated");

    // Parse JSON response
    let dialogue: DialogueLine[];
    try {
      // Try to extract JSON from the response (in case there's extra text)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }
      const parsed = JSON.parse(jsonMatch[0]);
      dialogue = parsed.dialogue;
      
      if (!dialogue || !Array.isArray(dialogue)) {
        throw new Error("Invalid dialogue format");
      }
    } catch (parseError) {
      console.error("Podcastify: Failed to parse JSON:", parseError);
      console.error("Podcastify: Raw response:", response);
      return NextResponse.json(
        { error: "Failed to parse podcast script" },
        { status: 500 }
      );
    }

    console.log(`Podcastify: Parsed ${dialogue.length} dialogue lines`);

    // Step 2: Generate audio for each dialogue line
    const audioChunks: Buffer[] = [];
    let audioGenerationFailed = false;

    console.log("Podcastify: Starting audio generation...");

    for (let i = 0; i < dialogue.length; i++) {
      const line = dialogue[i];
      // Use 'echo' for Host, 'nova' for Guest
      const voice = line.speaker === "Host" ? "echo" : "nova";

      try {
        console.log(`Podcastify: Generating audio ${i + 1}/${dialogue.length} (${line.speaker})`);
        const audioResponse = await openai.audio.speech.create({
          model: "tts-1",
          voice: voice,
          input: line.text,
          response_format: "mp3",
        });

        const arrayBuffer = await audioResponse.arrayBuffer();
        audioChunks.push(Buffer.from(arrayBuffer));
      } catch (audioError) {
        console.error(`Podcastify: Failed to generate audio for line ${i + 1}:`, audioError);
        audioGenerationFailed = true;
        // Continue with other lines even if one fails
      }
    }

    // If we have audio chunks, combine them
    let audioUrl: string | null = null;
    if (audioChunks.length > 0) {
      console.log(`Podcastify: Combining ${audioChunks.length} audio chunks...`);
      const combinedAudio = Buffer.concat(audioChunks);
      const base64Audio = combinedAudio.toString("base64");
      audioUrl = `data:audio/mp3;base64,${base64Audio}`;
      console.log("Podcastify: Audio generation complete!");
    } else {
      console.log("Podcastify: No audio generated");
    }

    return NextResponse.json({
      dialogue,
      audioUrl,
      audioError: audioGenerationFailed ? "Some audio segments failed to generate" : null,
    });
  } catch (error) {
    console.error("Podcastify error:", error);
    return NextResponse.json(
      { error: "Failed to generate podcast" },
      { status: 500 }
    );
  }
}
