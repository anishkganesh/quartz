import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";

const LEVEL_PROMPTS: Record<string, string> = {
  College: `Rewrite this content for a college undergraduate. Use academic language but explain complex terms. Keep [[concept]] brackets for clickable terms.`,
  
  "High School": `Rewrite this content for a high school student (ages 14-18). Use simpler vocabulary, add relatable examples, and break down complex ideas. Keep [[concept]] brackets for clickable terms.`,
  
  "Middle School": `Rewrite this content for a middle school student (ages 11-13). Use everyday words, lots of analogies to things kids know, and shorter sentences. Make it engaging! Keep [[concept]] brackets for clickable terms.`,
  
  Elementary: `Rewrite this content so a 5-year-old can understand it. Use very simple words, fun comparisons to toys/animals/food/family, and short sentences. Make it exciting and playful! Examples:
- "It's like when you..."
- "You know how..."
- "Think of it like your favorite..."
Keep [[concept]] brackets for clickable terms.`,
};

export async function POST(request: NextRequest) {
  try {
    const { content, topic, targetLevel } = await request.json();

    if (!content || !targetLevel) {
      return NextResponse.json(
        { error: "Content and target level are required" },
        { status: 400 }
      );
    }

    const levelPrompt = LEVEL_PROMPTS[targetLevel] || LEVEL_PROMPTS["Elementary"];

    const response = await openai.responses.create({
      model: "gpt-5.2",
      input: [
        {
          role: "system",
          content: levelPrompt,
        },
        {
          role: "user",
          content: `Simplify this article about "${topic || "this topic"}":\n\n${content}`,
        },
      ],
      reasoning: { effort: "none" },
      temperature: 0.8,
      max_output_tokens: 2500,
    });

    const simplifiedContent = response.output_text;

    if (!simplifiedContent) {
      return NextResponse.json(
        { error: "Failed to simplify content" },
        { status: 500 }
      );
    }

    return NextResponse.json({ content: simplifiedContent });
  } catch (error) {
    console.error("Simplify error:", error);
    return NextResponse.json(
      { error: "Failed to simplify article" },
      { status: 500 }
    );
  }
}
