import { NextRequest, NextResponse } from "next/server";
import { openai, WIKI_SYSTEM_PROMPT } from "@/lib/openai";

export async function POST(request: NextRequest) {
  try {
    const { topic } = await request.json();

    if (!topic || typeof topic !== "string") {
      return NextResponse.json(
        { error: "Topic is required" },
        { status: 400 }
      );
    }

    // Clean up the topic name
    const cleanTopic = topic.replace(/_/g, " ").trim();

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: WIKI_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: `Write a comprehensive encyclopedia article about "${cleanTopic}".

Requirements:
1. Start with a brief introduction (2-3 sentences, no heading)
2. Include 4-6 main sections with ## headings
3. Add subsections with ### where appropriate
4. Mark ALL educational concepts with [[double brackets]] - be VERY liberal
5. Use bullet points and numbered lists for clarity
6. Make it engaging and educational

CONCEPT MARKING - Mark ALL of these:
- Every abbreviation/acronym (e.g., [[DNA]], [[UVA]], [[NASA]], [[ATP]])
- Every type/variant/category (if there are types, mark EACH one separately)
- Every application/use case mentioned
- Every scientist/researcher/historical figure
- Every technical term, scientific concept, medical term
- Both multi-word phrases ([[quantum entanglement]]) and single concepts ([[energy]])

Example: If writing about UV light, mark [[UVA]], [[UVB]], [[UVC]], [[sunscreen]], [[skin cancer]], [[ozone layer]], etc. - each as a separate clickable concept.`,
        },
      ],
      temperature: 0.7,
      max_tokens: 2500,
    });

    const content = completion.choices[0]?.message?.content;

    if (!content) {
      return NextResponse.json(
        { error: "Failed to generate content" },
        { status: 500 }
      );
    }

    return NextResponse.json({ content, topic: cleanTopic });
  } catch (error) {
    console.error("Generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate article" },
      { status: 500 }
    );
  }
}
