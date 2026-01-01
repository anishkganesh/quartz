import { NextResponse } from "next/server";
import { openai, CHAT_SYSTEM_PROMPT, AI_MODEL, AI_REASONING_EFFORT } from "@/lib/openai";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function POST(request: Request) {
  try {
    const { messages, topic, articleContent } = await request.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: "Messages array is required" },
        { status: 400 }
      );
    }

    // Build context with article content
    const systemMessage = `${CHAT_SYSTEM_PROMPT}

The user is reading an article about "${topic.replace(/_/g, " ")}". Here is the article content for context:

---
${articleContent?.slice(0, 8000) || "No article content provided."}
---

Answer questions based on this article and your general knowledge.`;

    const completion = await openai.responses.create({
      model: AI_MODEL,
      input: [
        { role: "system", content: systemMessage },
        ...messages.map((msg: ChatMessage) => ({
          role: msg.role,
          content: msg.content,
        })),
      ],
      reasoning: { effort: AI_REASONING_EFFORT },
      temperature: 0.7,
      max_output_tokens: 1000,
    });

    const response = completion.output_text || "I couldn't generate a response.";

    return NextResponse.json({ response });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: "Failed to generate response" },
      { status: 500 }
    );
  }
}

