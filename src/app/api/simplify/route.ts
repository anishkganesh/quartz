import { NextRequest } from "next/server";
import { openai, AI_MODEL, AI_REASONING_EFFORT } from "@/lib/openai";

export const runtime = "nodejs";
export const maxDuration = 60;

const LEVEL_PROMPTS: Record<string, string> = {
  College: `Rewrite this content for a college undergraduate. Use academic language but explain complex terms. Keep [[concept]] brackets for clickable terms. Maintain the same section structure with ## and ### headings.`,
  
  "High School": `Rewrite this content for a high school student (ages 14-18). Use simpler vocabulary, add relatable examples, and break down complex ideas. Keep [[concept]] brackets for clickable terms. Maintain the same section structure with ## and ### headings.`,
  
  "Middle School": `Rewrite this content for a middle school student (ages 11-13). Use everyday words, lots of analogies to things kids know, and shorter sentences. Make it engaging! Keep [[concept]] brackets for clickable terms. Maintain the same section structure with ## and ### headings.`,
  
  Elementary: `Rewrite this content so a 5-year-old can understand it. Use very simple words, fun comparisons to toys/animals/food/family, and short sentences. Make it exciting and playful! Examples:
- "It's like when you..."
- "You know how..."
- "Think of it like your favorite..."
Keep [[concept]] brackets for clickable terms. Maintain the same section structure with ## and ### headings.`,
};

export async function POST(request: NextRequest) {
  try {
    const { content, topic, targetLevel } = await request.json();

    if (!content || !targetLevel) {
      return new Response(
        JSON.stringify({ error: "Content and target level are required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const levelPrompt = LEVEL_PROMPTS[targetLevel] || LEVEL_PROMPTS["Elementary"];

    const encoder = new TextEncoder();
    let isClosed = false;

    const stream = new ReadableStream({
      async start(controller) {
        const safeEnqueue = (data: string) => {
          if (!isClosed) {
            try {
              controller.enqueue(encoder.encode(data));
            } catch {
              isClosed = true;
            }
          }
        };

        const safeClose = () => {
          if (!isClosed) {
            try {
              controller.close();
              isClosed = true;
            } catch {
              isClosed = true;
            }
          }
        };

        try {
          const response = await openai.responses.create({
            model: AI_MODEL,
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
            reasoning: { effort: AI_REASONING_EFFORT },
            temperature: 0.8,
            max_output_tokens: 4000,
            stream: true,
          });

          let buffer = "";
          let fullContent = "";

          for await (const event of response) {
            if (isClosed) break;

            if (event.type === "response.output_text.delta") {
              const delta = event.delta || "";
              if (delta) {
                buffer += delta;
                fullContent += delta;

                // Check for complete sections (text ending with ## heading)
                const sectionPattern = /\n(## [^\n]+)/g;
                let match;
                let lastSectionEnd = 0;

                while ((match = sectionPattern.exec(buffer)) !== null) {
                  const sectionContent = buffer.slice(0, match.index);
                  if (sectionContent.trim()) {
                    safeEnqueue(`data: ${JSON.stringify({ type: "section", content: sectionContent })}\n\n`);
                  }
                  lastSectionEnd = match.index;
                }

                if (lastSectionEnd > 0) {
                  buffer = buffer.slice(lastSectionEnd);
                }
              }
            }
          }

          // Send any remaining content as final section
          if (buffer.trim()) {
            safeEnqueue(`data: ${JSON.stringify({ type: "section", content: buffer })}\n\n`);
          }

          // Clean up orphan brackets from the content
          // Remove trailing [[ or incomplete [[text without closing ]]
          const cleanedContent = fullContent
            .replace(/\[\[$/g, '')  // Remove trailing [[
            .replace(/\[\[(?![^\]]*\]\])[^\[]*$/g, ''); // Remove incomplete [[text at end

          // Send completion event with full content
          safeEnqueue(`data: ${JSON.stringify({ type: "done", content: cleanedContent })}\n\n`);
          safeClose();
        } catch (error) {
          console.error("Simplify streaming error:", error);
          if (!isClosed) {
            safeEnqueue(`data: ${JSON.stringify({ type: "error", message: error instanceof Error ? error.message : "Unknown error" })}\n\n`);
            safeClose();
          }
        }
      },
      cancel() {
        isClosed = true;
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Simplify error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to simplify article" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
