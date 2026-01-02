import { NextRequest, NextResponse } from "next/server";
import { openai, AI_MODEL, AI_REASONING_EFFORT } from "@/lib/openai";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get("audio") as File;

    if (!audioFile) {
      return NextResponse.json(
        { error: "Audio file is required" },
        { status: 400 }
      );
    }

    // Step 1: Transcribe with Whisper
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-1",
      language: "en",
    });

    const text = transcription.text.trim();

    if (!text) {
      return NextResponse.json(
        { error: "No speech detected" },
        { status: 400 }
      );
    }

    // Step 2: Detect intent with GPT-5.2
    const intentResponse = await openai.responses.create({
      model: AI_MODEL,
      input: [
        {
          role: "system",
          content: `You analyze speech transcriptions to detect user intent.

Classify as "question" if:
- Contains question words: "what", "why", "how", "when", "where", "who", "can you", "could you", "explain", "tell me"
- Is clearly a question directed at an assistant

Classify as "topic" ONLY if the speech contains an explicit keyword/phrase indicating navigation intent:
- Required keywords: "go to", "open", "take me to", "show me", "navigate to", "expand on", "read more", "elaborate on", "more about", "tell me more about", "learn about", "read about", "look at", "check out", "I want to learn"
- The keyword MUST be present - just saying a topic name alone is NOT enough
- Example: "black holes" alone = ignore, "go to black holes" = topic

Classify as "ignore" (DEFAULT) for:
- Topic names without navigation keywords (user is just reading aloud)
- Filler words: "um", "uh", "like", "so", "anyway"
- Greetings: "thank you", "thanks", "okay", "bye", "goodbye", "hello", "hi"
- Reading article text aloud (descriptive sentences without commands)
- Single words or short phrases without explicit intent keywords
- Background noise or unclear speech

Return ONLY JSON: {"type":"question|topic|ignore","content":"..."}
- question: include full question
- topic: include ONLY the topic name (properly capitalized)
- ignore: empty string ""

Examples of IGNORE (no navigation keyword):
"thank you" → {"type":"ignore","content":""}
"black holes" → {"type":"ignore","content":""}
"quantum mechanics" → {"type":"ignore","content":""}
"the network layer handles" → {"type":"ignore","content":""}
"interesting concept" → {"type":"ignore","content":""}

Examples of QUESTION:
"What is quantum mechanics?" → {"type":"question","content":"What is quantum mechanics?"}
"Can you explain photosynthesis?" → {"type":"question","content":"Can you explain photosynthesis?"}
"Why does this happen?" → {"type":"question","content":"Why does this happen?"}

Examples of TOPIC (has navigation keyword):
"Go to black holes" → {"type":"topic","content":"Black Holes"}
"Read more on quantum entanglement" → {"type":"topic","content":"Quantum Entanglement"}
"I want to learn about DNA" → {"type":"topic","content":"DNA"}
"More about photosynthesis" → {"type":"topic","content":"Photosynthesis"}
"Check out machine learning" → {"type":"topic","content":"Machine Learning"}
"Open the network article" → {"type":"topic","content":"Network"}
"Expand on relativity" → {"type":"topic","content":"Relativity"}`,
        },
        {
          role: "user",
          content: text,
        },
      ],
      reasoning: { effort: AI_REASONING_EFFORT },
      temperature: 0.1,
      max_output_tokens: 150,
    });

    const intentText = intentResponse.output_text || "";
    
    // Parse the intent response - DEFAULT TO IGNORE
    let result = { type: "ignore" as "question" | "topic" | "ignore", content: "" };
    
    try {
      const jsonMatch = intentText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.type) {
          result = {
            type: parsed.type,
            content: parsed.content || "",
          };
        }
      }
    } catch {
      // Default to ignore on parse failure
      console.error("Failed to parse intent, defaulting to ignore");
    }

    return NextResponse.json({
      transcript: text,
      type: result.type,
      content: result.content,
    });
  } catch (error) {
    console.error("Transcribe error:", error);
    return NextResponse.json(
      { error: "Failed to transcribe audio" },
      { status: 500 }
    );
  }
}

