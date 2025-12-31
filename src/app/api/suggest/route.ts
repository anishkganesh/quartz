import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json();

    if (!query || query.trim().length < 2) {
      return NextResponse.json({ suggestions: [] });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-5.2",
      messages: [
        {
          role: "system",
          content: `You are a knowledge graph assistant. Given a search query, generate 8 related concept suggestions that form a concept mindmap. Include:
- Direct matches and variations of the query
- Related parent concepts (broader topics)
- Related child concepts (more specific topics)
- Adjacent concepts (related but different domains)

Return ONLY a JSON array of 8 concept names as strings, ordered by relevance. Keep names concise (1-4 words). Example:
["Quantum Mechanics", "Wave-Particle Duality", "Heisenberg Uncertainty", "Quantum Entanglement", "Schrödinger Equation", "Quantum Computing", "Particle Physics", "String Theory"]`,
        },
        {
          role: "user",
          content: `Search query: "${query}"

Generate 8 related concepts.`,
        },
      ],
      temperature: 0.7,
      max_tokens: 300,
    });

    const responseText = completion.choices[0]?.message?.content || "[]";
    
    // Parse JSON response
    let suggestions: string[] = [];
    try {
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        suggestions = JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Fallback: extract quoted strings
      const matches = responseText.match(/"([^"]+)"/g);
      if (matches) {
        suggestions = matches.map((m) => m.replace(/"/g, ""));
      }
    }

    // Ensure the original query is included at the top
    const queryLower = query.toLowerCase();
    suggestions = suggestions.filter(
      (s) => s.toLowerCase() !== queryLower
    );
    suggestions = [query, ...suggestions].slice(0, 8);

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error("Suggest error:", error);
    // Return query as only suggestion on error
    const { query } = await request.clone().json();
    return NextResponse.json({ suggestions: query ? [query] : [] });
  }
}

