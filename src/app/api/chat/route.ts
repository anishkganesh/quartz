import { NextResponse } from "next/server";
import { openai, CHAT_SYSTEM_PROMPT } from "@/lib/openai";

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

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: systemMessage },
        ...messages.map((msg: ChatMessage) => ({
          role: msg.role,
          content: msg.content,
        })),
      ],
      temperature: 0.7,
      max_tokens: 1000,
    });

    const response = completion.choices[0]?.message?.content || "I couldn't generate a response.";

    return NextResponse.json({ response });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: "Failed to generate response" },
      { status: 500 }
    );
  }
}

