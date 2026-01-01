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
          content: `You analyze speech transcriptions to detect user intent. Be helpful - if the user seems to want to learn about a topic or ask a question, help them.

Classify as "question" if:
- Contains question words: "what", "why", "how", "when", "where", "who", "can you", "could you", "explain", "tell me"
- Sounds like a question directed at an assistant
- User wants something explained

Classify as "topic" if the user wants to navigate to or learn about a specific topic:
- Navigation phrases: "go to", "open", "take me to", "show me", "navigate to"
- Learning intent: "I want to learn about", "expand on", "read more on", "read more about", "elaborate on", "more about", "tell me more about", "learn about", "read about", "look at", "check out"
- Even simple requests like "network" or "black holes" when said with intent to navigate
- The user mentions a topic name and seems to want to see it

Classify as "ignore" ONLY for:
- Pure filler words: "um", "uh", "like", "so", "anyway"
- Greetings only: "thank you", "thanks", "okay", "bye", "goodbye", "hello", "hi"
- Clearly reading article text aloud (long descriptive sentences)
- Background noise or unintelligible speech

When in doubt between "topic" and "ignore", prefer "topic" if a clear topic name is mentioned.

Return ONLY JSON: {"type":"question|topic|ignore","content":"..."}
- question: include full question
- topic: include ONLY the topic name (properly capitalized)
- ignore: empty string ""

Examples of IGNORE:
"thank you" → {"type":"ignore","content":""}
"um okay so" → {"type":"ignore","content":""}
"the mitochondria is the powerhouse of the cell and produces ATP through" → {"type":"ignore","content":""}

Examples of QUESTION:
"What is quantum mechanics?" → {"type":"question","content":"What is quantum mechanics?"}
"Can you explain photosynthesis?" → {"type":"question","content":"Can you explain photosynthesis?"}
"Why does this happen?" → {"type":"question","content":"Why does this happen?"}

Examples of TOPIC:
"Go to black holes" → {"type":"topic","content":"Black Holes"}
"Network" → {"type":"topic","content":"Network"}
"Read more on quantum entanglement" → {"type":"topic","content":"Quantum Entanglement"}
"I want to learn about DNA" → {"type":"topic","content":"DNA"}
"More about photosynthesis" → {"type":"topic","content":"Photosynthesis"}
"Check out machine learning" → {"type":"topic","content":"Machine Learning"}
"Black holes" → {"type":"topic","content":"Black Holes"}`,
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

