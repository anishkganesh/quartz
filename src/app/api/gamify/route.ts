import { NextRequest, NextResponse } from "next/server";
import { openai, AI_MODEL, AI_REASONING_EFFORT } from "@/lib/openai";
import { getCachedQuizQuestions, cacheQuizQuestions, normalizeTopic } from "@/lib/server-cache";

const CACHED_QUESTIONS_COUNT = 10;
const QUESTIONS_PER_BATCH = 3;

interface Question {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export async function POST(request: NextRequest) {
  try {
    const { topic, content, startIndex = 0 } = await request.json();

    if (!topic) {
      return NextResponse.json(
        { error: "Topic is required" },
        { status: 400 }
      );
    }

    const normalizedTopicStr = normalizeTopic(topic);

    // Check cache first
    const cachedQuestions = await getCachedQuizQuestions(normalizedTopicStr) as Question[] | null;
    
    // If we have cached questions and startIndex is within cache range
    if (cachedQuestions && startIndex < cachedQuestions.length) {
      const endIndex = Math.min(startIndex + QUESTIONS_PER_BATCH, cachedQuestions.length);
      const questionsToReturn = cachedQuestions.slice(startIndex, endIndex);
      
      console.log(`Gamify: Returning cached questions ${startIndex}-${endIndex} of ${cachedQuestions.length}`);
      
      return NextResponse.json({
        questions: questionsToReturn,
        cached: true,
        totalCached: cachedQuestions.length,
        startIndex,
        endIndex,
      });
    }

    // If startIndex >= cached count, generate fresh (don't cache these)
    const isBeyondCache = cachedQuestions && startIndex >= cachedQuestions.length;
    
    // Determine how many questions to generate
    const questionsToGenerate = isBeyondCache ? QUESTIONS_PER_BATCH : CACHED_QUESTIONS_COUNT;

    console.log(`Gamify: Generating ${questionsToGenerate} fresh questions${isBeyondCache ? " (beyond cache)" : ""}`);

    const apiResponse = await openai.responses.create({
      model: AI_MODEL,
      input: [
        {
          role: "system",
          content: `You are a quiz generator. Create a multiple-choice quiz to test understanding of the topic.

Rules:
- Generate exactly ${questionsToGenerate} questions
- Each question has exactly 4 options (A, B, C, D)
- Questions should range from basic recall to deeper understanding
- Include clear, educational explanations for correct answers
- Make incorrect options plausible but clearly wrong
- Vary the difficulty and cover different aspects of the topic

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
      reasoning: { effort: AI_REASONING_EFFORT },
      temperature: 0.7,
      max_output_tokens: questionsToGenerate > 3 ? 4000 : 2000,
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
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }
      const parsed = JSON.parse(jsonMatch[0]);
      const questions: Question[] = parsed.questions;

      if (!questions || !Array.isArray(questions)) {
        throw new Error("Invalid questions format");
      }

      // If this is initial generation (not beyond cache), cache all questions
      if (!isBeyondCache) {
        await cacheQuizQuestions(normalizedTopicStr, questions);
        console.log(`Gamify: Cached ${questions.length} questions`);
        
        // Return first batch
        return NextResponse.json({
          questions: questions.slice(0, QUESTIONS_PER_BATCH),
          cached: false,
          totalCached: questions.length,
          startIndex: 0,
          endIndex: QUESTIONS_PER_BATCH,
        });
      }

      // Beyond cache - return fresh questions (not cached)
      return NextResponse.json({
        questions,
        cached: false,
        fresh: true,
      });
    } catch (parseError) {
      console.error("Failed to parse quiz JSON:", parseError);
      console.error("Raw response:", response);
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
