import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";

export async function POST(request: NextRequest) {
  try {
    const { topic, content } = await request.json();

    if (!topic) {
      return NextResponse.json(
        { error: "Topic is required" },
        { status: 400 }
      );
    }

    const apiResponse = await openai.responses.create({
      model: "gpt-5.2",
      input: [
        {
          role: "system",
          content: `You are a quiz generator. Create a multiple-choice quiz to test understanding of the topic.

Rules:
- Generate exactly 5 questions
- Each question has exactly 4 options (A, B, C, D)
- Questions should range from basic recall to deeper understanding
- Include clear, educational explanations for correct answers
- Make incorrect options plausible but clearly wrong

Output ONLY valid JSON in this exact format:
{
  "questions": [
    {
      "question": "Question text here?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctIndex": 0,
      "explanation": "Explanation of why this is correct"
    }
  ]
}

Make sure correctIndex is 0-3 (the index of the correct option in the options array).`,
        },
        {
          role: "user",
          content: `Create a quiz about "${topic}". Use this content as reference:\n\n${content?.slice(0, 2000) || "Generate from the topic name"}`,
        },
      ],
      reasoning: { effort: "none" },
      temperature: 0.7,
      max_output_tokens: 2000,
    });

    const response = apiResponse.output_text;

    if (!response) {
      return NextResponse.json(
        { error: "Failed to generate quiz" },
        { status: 500 }
      );
    }

    // Parse JSON response
    try {
      const parsed = JSON.parse(response);
      return NextResponse.json(parsed);
    } catch {
      console.error("Failed to parse quiz JSON");
      return NextResponse.json(
        { error: "Failed to parse quiz" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Gamify error:", error);
    return NextResponse.json(
      { error: "Failed to generate quiz" },
      { status: 500 }
    );
  }
}

