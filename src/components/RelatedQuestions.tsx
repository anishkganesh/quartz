"use client";

import { useState, useEffect } from "react";
import { MessageCircleQuestion } from "lucide-react";

interface RelatedQuestionsProps {
  topic: string;
  content: string;
  onQuestionClick: (question: string) => void;
}

export default function RelatedQuestions({
  topic,
  content,
  onQuestionClick,
}: RelatedQuestionsProps) {
  const [questions, setQuestions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [_error, setError] = useState<string | null>(null);

  useEffect(() => {
    generateQuestions();
  }, [topic]);

  const generateQuestions = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/related-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, content }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate questions");
      }

      const data = await response.json();
      setQuestions(data.questions || []);
    } catch (err) {
      console.error("Related questions error:", err);
      setError("Failed to load questions");
      // Set default questions as fallback
      setQuestions([
        `What is the history of ${topic}?`,
        `How does ${topic} work?`,
        `What are the applications of ${topic}?`,
        `What are common misconceptions about ${topic}?`,
        `How is ${topic} evolving?`,
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="related-questions">
        <div className="related-questions-header">
          <MessageCircleQuestion className="w-4 h-4" />
          <span>Related Questions</span>
        </div>
        <div className="related-questions-list">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton h-10 w-full rounded-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="related-questions">
      <div className="related-questions-header">
        <MessageCircleQuestion className="w-4 h-4" />
        <span>Related Questions</span>
      </div>
      <div className="related-questions-list">
        {questions.map((question, index) => (
          <button
            key={index}
            onClick={() => onQuestionClick(question)}
            className="related-question-item"
          >
            {question}
          </button>
        ))}
      </div>
    </div>
  );
}

