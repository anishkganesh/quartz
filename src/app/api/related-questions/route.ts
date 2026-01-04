import { NextRequest, NextResponse } from "next/server";
import { openai, AI_MODEL, AI_REASONING_EFFORT } from "@/lib/openai";
import { getCachedRelatedQuestions, cacheRelatedQuestions, normalizeTopic } from "@/lib/server-cache";

export async function POST(request: NextRequest) {
  try {
    const { topic, content } = await request.json();

    if (!topic) {
      return NextResponse.json(
        { error: "Topic is required" },
        { status: 400 }
      );
    }

    const normalizedTopicStr = normalizeTopic(topic);

    // Check cache first
    const cachedQuestions = await getCachedRelatedQuestions(normalizedTopicStr);
    if (cachedQuestions) {
      console.log("Related questions: Returning cached questions for", topic);
      return NextResponse.json({ questions: cachedQuestions, cached: true });
    }

    const apiResponse = await openai.responses.create({
      model: AI_MODEL,
      input: [
        {
          role: "system",
          content: `You are an expert educator. Generate exactly 5 thought-provoking questions about the given topic that would help someone deepen their understanding. The questions should:
- Be engaging and curiosity-sparking
- Cover different aspects of the topic
- Range from foundational to advanced
- Be phrased naturally, as if a curious student is asking

Return ONLY a JSON array of 5 question strings, nothing else. Example format:
["What is X?", "How does Y work?", "Why is Z important?", "What happens when...?", "How does X relate to Y?"]`,
        },
        {
          role: "user",
          content: `Topic: ${topic}

Article content (for context):
${content?.slice(0, 2000) || "Generate questions based on the topic name"}

Generate 5 related questions.`,
        },
      ],
      reasoning: { effort: AI_REASONING_EFFORT },
      temperature: 0.8,
      max_output_tokens: 500,
    });

    const responseText = apiResponse.output_text || "[]";
    
    // Parse JSON response
    let questions: string[] = [];
    try {
      // Try to extract JSON array from response
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        questions = JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Fallback: split by newlines if JSON parsing fails
      questions = responseText
        .split("\n")
        .filter((line) => line.trim().startsWith('"') || line.trim().match(/^\d+\./))
        .map((line) => line.replace(/^[\d."\s-]+/, "").replace(/"[,]?$/, "").trim())
        .filter((q) => q.length > 0)
        .slice(0, 5);
    }

    // Ensure we have exactly 5 questions
    if (questions.length < 5) {
      const defaultQuestions = [
        `What is the history of ${topic}?`,
        `How does ${topic} work in practice?`,
        `What are the key principles of ${topic}?`,
        `How is ${topic} applied in the real world?`,
        `What are the future developments in ${topic}?`,
      ];
      while (questions.length < 5) {
        questions.push(defaultQuestions[questions.length]);
      }
    }

    const finalQuestions = questions.slice(0, 5);

    // Cache the questions
    await cacheRelatedQuestions(normalizedTopicStr, finalQuestions);

    return NextResponse.json({ questions: finalQuestions });
  } catch (error) {
    console.error("Related questions error:", error);
    return NextResponse.json(
      { error: "Failed to generate questions" },
      { status: 500 }
    );
  }
}
