import { NextRequest } from "next/server";
import { openai, WIKI_SYSTEM_PROMPT, AI_MODEL, AI_REASONING_EFFORT } from "@/lib/openai";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { checkUsage, incrementUsage } from "@/lib/usage";
import { getCachedArticle, cacheArticle, normalizeTopic } from "@/lib/server-cache";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const { topic, existingContent } = await request.json();
    const isContinuation = !!existingContent;

    if (!topic || typeof topic !== "string") {
      return new Response(JSON.stringify({ error: "Topic is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Check authentication and usage (skip in dev mode)
    const isDev = process.env.NODE_ENV === 'development';
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // If user is logged in, check usage limits (skip in dev mode)
    if (!isDev && user) {
      const usage = await checkUsage(supabase, user.id);

      if (!usage.canGenerate) {
        return new Response(
          JSON.stringify({
            error: "usage_limit",
            message: "Daily limit reached",
            currentUsage: usage.currentCount,
            limit: usage.limit,
          }),
          {
            status: 429,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    // Clean up the topic name
    const cleanTopic = topic.replace(/_/g, " ").trim();
    const normalizedTopic = normalizeTopic(cleanTopic);

    // Check cache first (skip for continuations - we already have partial content)
    if (!isContinuation) {
      const cachedContent = await getCachedArticle(normalizedTopic);
      if (cachedContent) {
        // Return cached content as a stream
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            // Send cached content as sections
            const sections = cachedContent.split(/(?=\n## )/);
            for (const section of sections) {
              if (section.trim()) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "section", content: section })}\n\n`));
              }
            }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done", content: cachedContent, topic: cleanTopic, cached: true })}\n\n`));
            controller.close();
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      }
    }

    // Increment usage for logged-in users at start of generation (skip in dev mode and continuations)
    if (!isDev && user && !isContinuation) {
      await incrementUsage(supabase, user.id);
    }

    const encoder = new TextEncoder();
    let isClosed = false;

    // Build the appropriate prompt based on whether this is a continuation
    const userPrompt = isContinuation
      ? `Continue this encyclopedia article about "${cleanTopic}" from where it left off. Do NOT repeat any content that already exists. Start writing immediately where the existing content ends.

EXISTING CONTENT (do not repeat):
${existingContent}

CONTINUE FROM HERE - write the remaining sections to complete the article. Keep the same style and continue marking concepts with [[double brackets]].`
      : `Write a comprehensive encyclopedia article about "${cleanTopic}".

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

Example: If writing about UV light, mark [[UVA]], [[UVB]], [[UVC]], [[sunscreen]], [[skin cancer]], [[ozone layer]], etc. - each as a separate clickable concept.`;

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
                content: WIKI_SYSTEM_PROMPT,
              },
              {
                role: "user",
                content: userPrompt,
              },
            ],
            reasoning: { effort: AI_REASONING_EFFORT },
            temperature: 0.7,
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
                  // Found a new section heading - send everything before it
                  const sectionContent = buffer.slice(0, match.index);
                  if (sectionContent.trim()) {
                    safeEnqueue(`data: ${JSON.stringify({ type: "section", content: sectionContent })}\n\n`);
                  }
                  lastSectionEnd = match.index;
                }

                // Keep the remaining content (from last section heading onwards) in buffer
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
          const cleanedNewContent = fullContent
            .replace(/\[\[$/g, '')  // Remove trailing [[
            .replace(/\[\[(?![^\]]*\]\])[^\[]*$/g, ''); // Remove incomplete [[text at end

          // For continuations, combine existing + new content
          const finalContent = isContinuation
            ? existingContent + cleanedNewContent
            : cleanedNewContent;

          // Only cache if streaming completed fully (user didn't cancel)
          if (!isClosed) {
            await cacheArticle(normalizedTopic, finalContent);
          }

          // Send completion event with full content for caching
          // For continuations, send only the NEW content (frontend will append)
          safeEnqueue(`data: ${JSON.stringify({ 
            type: "done", 
            content: isContinuation ? cleanedNewContent : finalContent, 
            fullContent: finalContent,
            topic: cleanTopic,
            isContinuation 
          })}\n\n`);
          safeClose();
        } catch (error) {
          console.error("Streaming error:", error);
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
    console.error("Generate error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to generate article" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
