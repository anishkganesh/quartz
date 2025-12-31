import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";

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

    // Step 2: Detect intent with GPT-5.2 - VERY CONSERVATIVE
    const intentResponse = await openai.responses.create({
      model: "gpt-5.2",
      input: [
        {
          role: "system",
          content: `You analyze speech transcriptions. Be EXTREMELY CONSERVATIVE - default to "ignore" unless there is a CLEAR, EXPLICIT request.

ONLY classify as "question" if ALL conditions are met:
- Contains explicit question words: "what", "why", "how", "when", "where", "who", "can you", "could you", "explain", "tell me"
- Is a complete, coherent question directed at an assistant
- NOT just reading text aloud or talking to themselves

ONLY classify as "topic" if ALL conditions are met:
- Contains explicit navigation/expansion phrases: "go to", "open", "take me to", "show me", "navigate to", "I want to learn about", "expand on", "read more on", "read more about", "elaborate on", "more about", "tell me more about"
- Clearly requests to open a new article/subarticle or expand on a concept
- NOT just mentioning a concept in passing

Classify as "ignore" (DEFAULT) for:
- Reading text aloud without a request
- Statements, observations, comments
- Filler words: "um", "uh", "like", "so", "anyway"
- Greetings/pleasantries: "thank you", "thanks", "okay", "bye", "goodbye", "hello", "hi"
- Incomplete sentences or fragments
- Background conversation snippets
- Self-talk or thinking out loud
- Single words or short phrases without clear intent
- ANYTHING that isn't an explicit, clear request

Return ONLY JSON: {"type":"question|topic|ignore","content":"..."}
- question: include full question
- topic: include ONLY the topic name
- ignore: empty string ""

Examples of IGNORE (these should ALL be ignored):
"thank you for watching" → {"type":"ignore","content":""}
"okay so basically" → {"type":"ignore","content":""}
"quantum mechanics is the study of" → {"type":"ignore","content":""}
"interesting" → {"type":"ignore","content":""}
"black holes" → {"type":"ignore","content":""}
"the fundamental theory" → {"type":"ignore","content":""}
"and that's it" → {"type":"ignore","content":""}
"bye bye" → {"type":"ignore","content":""}
"please see the disclaimer" → {"type":"ignore","content":""}

Examples of QUESTION (explicit questions only):
"What is quantum mechanics?" → {"type":"question","content":"What is quantum mechanics?"}
"Can you explain how photosynthesis works?" → {"type":"question","content":"Can you explain how photosynthesis works?"}
"Why does this happen?" → {"type":"question","content":"Why does this happen?"}

Examples of TOPIC (explicit navigation/expansion):
"Go to black holes" → {"type":"topic","content":"Black Holes"}
"Take me to quantum computing" → {"type":"topic","content":"Quantum Computing"}
"Open the article on DNA" → {"type":"topic","content":"DNA"}
"Expand on photosynthesis" → {"type":"topic","content":"Photosynthesis"}
"Read more on quantum entanglement" → {"type":"topic","content":"Quantum Entanglement"}
"Elaborate on the uncertainty principle" → {"type":"topic","content":"Uncertainty Principle"}
"More about black holes" → {"type":"topic","content":"Black Holes"}`,
        },
        {
          role: "user",
          content: text,
        },
      ],
      reasoning: { effort: "none" },
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

