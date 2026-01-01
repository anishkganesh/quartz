import { NextRequest, NextResponse } from "next/server";
import { openai, AI_MODEL, AI_REASONING_EFFORT } from "@/lib/openai";

export async function POST(request: NextRequest) {
  try {
    const { topic, content } = await request.json();

    if (!topic) {
      return NextResponse.json(
        { error: "Topic is required" },
        { status: 400 }
      );
    }

    // Step 1: Generate a video prompt with GPT-5.2
    console.log("TikTokify: Generating video prompt...");
    const promptResponse = await openai.responses.create({
      model: AI_MODEL,
      input: [
        {
          role: "system",
          content: `You are an expert at creating prompts for AI video generation. Create a detailed, visual prompt for a TikTok-style educational video.

The prompt should describe:
- Shot type, subject, action, setting, and lighting
- Visual style (modern, engaging, colorful)
- Dynamic movement and energy appropriate for TikTok
- Camera movements and transitions

Keep the prompt under 500 characters. Focus on VISUAL descriptions only.`,
        },
        {
          role: "user",
          content: `Create a TikTok video prompt about "${topic}". 
          
Context from article:
${content?.slice(0, 1000) || "Generate from the topic name"}

The video should be vertical (portrait 9:16), 8 seconds, visually engaging.`,
        },
      ],
      reasoning: { effort: AI_REASONING_EFFORT },
      temperature: 0.9,
      max_output_tokens: 300,
    });

    const videoPrompt = promptResponse.output_text;

    if (!videoPrompt) {
      return NextResponse.json(
        { error: "Failed to generate video prompt" },
        { status: 500 }
      );
    }

    console.log("TikTokify: Video prompt generated:", videoPrompt.slice(0, 100));

    // Return prompt/script - video generation requires special quota
    // The prompt can be used with external video generation tools
    console.log("TikTokify: Returning video prompt for external use");
    return NextResponse.json({
      script: videoPrompt,
      videoUrl: null,
      mode: "script",
    });
  } catch (error) {
    console.error("TikTokify error:", error);
    return NextResponse.json(
      { error: "Failed to generate TikTok content" },
      { status: 500 }
    );
  }
}
