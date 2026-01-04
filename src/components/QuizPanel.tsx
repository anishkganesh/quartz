"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, Check, X as XIcon } from "lucide-react";

export interface Question {
  id?: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

interface QuizPanelProps {
  topic: string;
  content: string;
  onClose: () => void;
  cachedQuestions?: Question[];
  onQuestionsGenerated?: (questions: Question[]) => void;
}

export default function QuizPanel({
  topic,
  content,
  onClose,
  cachedQuestions,
  onQuestionsGenerated,
}: QuizPanelProps) {
  // Question queue - current questions to show
  const [questionQueue, setQuestionQueue] = useState<Question[]>([]);
  // Wrong answers to retry later
  const [wrongAnswers, setWrongAnswers] = useState<Question[]>([]);
  // Track all question texts to avoid duplicates
  const [seenQuestions, setSeenQuestions] = useState<Set<string>>(new Set());
  // Total questions answered (for display)
  const [questionCount, setQuestionCount] = useState(0);
  // Questions since last wrong answer insertion
  const [questionsSinceWrongRetry, setQuestionsSinceWrongRetry] = useState(0);
  // Track how many cached questions we've requested from server
  const [cachedQuestionsIndex, setCachedQuestionsIndex] = useState(0);
  
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingMore, setIsGeneratingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const hasInitializedRef = useRef(false);

  // Initialize with cached questions or generate new ones
  useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    if (cachedQuestions && cachedQuestions.length > 0) {
      const questionsWithIds = cachedQuestions.map((q, i) => ({
        ...q,
        id: q.id || `q-${Date.now()}-${i}`,
      }));
      setQuestionQueue(questionsWithIds);
      setSeenQuestions(new Set(cachedQuestions.map(q => q.question)));
    } else {
      generateMoreQuestions(true, 0);
    }
  }, [topic, cachedQuestions]);

  // Generate more questions
  const generateMoreQuestions = useCallback(async (isInitial = false, startIndex?: number) => {
    if (isInitial) {
      setIsLoading(true);
    } else {
      setIsGeneratingMore(true);
    }
    setError(null);

    // Determine the start index for this request
    const requestStartIndex = startIndex ?? cachedQuestionsIndex;

    try {
      const response = await fetch("/api/gamify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          topic, 
          content,
          startIndex: requestStartIndex,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate quiz");
      }

      const data = await response.json();
      
      // Update our index if we got cached questions
      if (data.endIndex !== undefined) {
        setCachedQuestionsIndex(data.endIndex);
      } else if (data.fresh) {
        // Fresh questions beyond cache - don't update index
      }

      const newQuestions: Question[] = data.questions
        .filter((q: Question) => !seenQuestions.has(q.question))
        .map((q: Question, i: number) => ({
          ...q,
          id: `q-${Date.now()}-${i}`,
        }));

      if (newQuestions.length > 0) {
        setQuestionQueue(prev => [...prev, ...newQuestions]);
        setSeenQuestions(prev => {
          const updated = new Set(prev);
          newQuestions.forEach(q => updated.add(q.question));
          return updated;
        });
        
        if (isInitial) {
          onQuestionsGenerated?.(newQuestions);
        }
      }
    } catch (err) {
      if (isInitial) {
        setError("Failed to generate quiz. Please try again.");
      }
      console.error(err);
    } finally {
      setIsLoading(false);
      setIsGeneratingMore(false);
    }
  }, [topic, content, seenQuestions, onQuestionsGenerated, cachedQuestionsIndex]);

  // Check if we need to generate more questions
  useEffect(() => {
    if (questionQueue.length < 3 && !isGeneratingMore && !isLoading) {
      generateMoreQuestions(false);
    }
  }, [questionQueue.length, isGeneratingMore, isLoading, generateMoreQuestions]);

  const handleSelectAnswer = (index: number) => {
    if (isAnswered) return;
    setSelectedAnswer(index);
  };

  const handleSubmit = () => {
    if (selectedAnswer === null || questionQueue.length === 0) return;

    setIsAnswered(true);
    const currentQuestion = questionQueue[0];
    
    // If wrong, save for later retry
    if (selectedAnswer !== currentQuestion.correctIndex) {
      setWrongAnswers(prev => [...prev, currentQuestion]);
    }
  };

  const handleNext = () => {
    // Remove current question from queue
    setQuestionQueue(prev => prev.slice(1));
    setQuestionCount(prev => prev + 1);
    setSelectedAnswer(null);
    setIsAnswered(false);
    
    // Track questions since wrong retry
    const newCount = questionsSinceWrongRetry + 1;
    setQuestionsSinceWrongRetry(newCount);
    
    // Randomly insert a wrong answer back into the queue (after 3-5 questions)
    if (wrongAnswers.length > 0 && newCount >= 3 + Math.floor(Math.random() * 3)) {
      const wrongToRetry = wrongAnswers[0];
      setWrongAnswers(prev => prev.slice(1));
      
      // Insert at position 2-4 in the queue (not immediately)
      const insertPosition = Math.min(2 + Math.floor(Math.random() * 3), questionQueue.length);
      setQuestionQueue(prev => {
        const updated = [...prev];
        updated.splice(insertPosition, 0, { ...wrongToRetry, id: `retry-${Date.now()}` });
        return updated;
      });
      
      setQuestionsSinceWrongRetry(0);
    }
  };

  const currentQuestion = questionQueue[0];

  return (
    <div className="feature-panel">
      <div className="feature-panel-header">
        <h3 className="feature-panel-title">Gamify</h3>
        <button onClick={onClose} className="panel-close">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="feature-panel-content">
        {isLoading ? (
          <div className="feature-loading">
            <div className="spinner" />
            <p className="feature-loading-text">Generating...</p>
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <p className="text-red-500 mb-4">{error}</p>
            <button onClick={() => generateMoreQuestions(true, 0)} className="pill-btn text-sm">
              Try Again
            </button>
          </div>
        ) : currentQuestion ? (
          <div>
            {/* Question number only */}
            <div className="mb-4">
              <span className="text-sm text-foreground-muted">
                Question {questionCount + 1}
              </span>
            </div>

            {/* Question */}
            <div className="quiz-question">
              <p className="quiz-question-text">{currentQuestion.question}</p>

              <div className="quiz-options">
                {currentQuestion.options.map((option, index) => {
                  let className = "quiz-option";
                  if (isAnswered) {
                    if (index === currentQuestion.correctIndex) {
                      className += " correct";
                    } else if (
                      index === selectedAnswer &&
                      index !== currentQuestion.correctIndex
                    ) {
                      className += " incorrect";
                    }
                  } else if (index === selectedAnswer) {
                    className += " selected";
                  }

                  return (
                    <button
                      key={index}
                      onClick={() => handleSelectAnswer(index)}
                      className={className}
                      disabled={isAnswered}
                    >
                      <span className="flex items-center gap-2">
                        {isAnswered && index === currentQuestion.correctIndex && (
                          <Check className="w-4 h-4 text-green-500" />
                        )}
                        {isAnswered &&
                          index === selectedAnswer &&
                          index !== currentQuestion.correctIndex && (
                            <XIcon className="w-4 h-4 text-red-500" />
                          )}
                        {option}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Explanation */}
              {isAnswered && (
                <div className="mt-4 bg-background-secondary rounded-lg animate-fade-in" style={{ padding: '0.625rem 0.875rem' }}>
                  <p className="text-sm mb-0">
                    <strong>Explanation:</strong> {currentQuestion.explanation}
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="mt-6 flex justify-end">
                {!isAnswered ? (
                  <button
                    onClick={handleSubmit}
                    disabled={selectedAnswer === null}
                    className="pill-btn text-sm"
                  >
                    Submit Answer
                  </button>
                ) : (
                  <button onClick={handleNext} className="pill-btn text-sm">
                    Next Question
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="feature-loading">
            <div className="spinner" />
            <p className="feature-loading-text">Loading next question...</p>
          </div>
        )}
      </div>
    </div>
  );
}
