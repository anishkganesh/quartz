"use client";

import { useState } from "react";
import { X, ArrowDown, Check } from "lucide-react";
import WikiContent from "./WikiContent";

const LEVELS = [
  { id: 1, name: "Expert", description: "Original content" },
  { id: 2, name: "College", description: "Undergraduate level" },
  { id: 3, name: "High School", description: "Teen-friendly" },
  { id: 4, name: "Middle School", description: "Simple terms" },
  { id: 5, name: "Elementary", description: "5-year-old friendly" },
];

interface SimplifyPanelProps {
  topic: string;
  originalContent: string;
  currentLevel: number;
  onLevelChange: (level: number, content: string) => void;
  onClose: () => void;
  onConceptClick: (concept: string) => void;
  simplifiedContents: Record<number, string>;
}

export default function SimplifyPanel({
  topic,
  originalContent,
  currentLevel,
  onLevelChange,
  onClose,
  onConceptClick,
  simplifiedContents,
}: SimplifyPanelProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSimplify = async () => {
    if (currentLevel >= 5) return;

    const nextLevel = currentLevel + 1;

    // Check if already cached
    if (simplifiedContents[nextLevel]) {
      onLevelChange(nextLevel, simplifiedContents[nextLevel]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/simplify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: simplifiedContents[currentLevel] || originalContent,
          topic,
          targetLevel: LEVELS[nextLevel - 1].name,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to simplify");
      }

      const data = await response.json();
      onLevelChange(nextLevel, data.content);
    } catch (err) {
      setError("Failed to simplify. Please try again.");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const currentLevelInfo = LEVELS[currentLevel - 1];
  const displayContent = simplifiedContents[currentLevel] || originalContent;

  return (
    <div className="feature-panel">
      <div className="feature-panel-header">
        <h3 className="feature-panel-title">Simplify</h3>
        <button onClick={onClose} className="panel-close">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="feature-panel-content">
        {/* Level indicator */}
        <div className="mb-6">
          <div className="simplify-levels mb-2">
            {LEVELS.map((level) => (
              <div
                key={level.id}
                className={`level-dot ${level.id <= currentLevel ? "active" : ""}`}
                title={level.name}
              />
            ))}
          </div>
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium">{currentLevelInfo.name}</span>
              <span className="text-xs text-foreground-muted ml-2">
                {currentLevelInfo.description}
              </span>
            </div>
            {currentLevel < 5 && (
              <button
                onClick={handleSimplify}
                disabled={isLoading}
                className="pill-btn text-sm"
              >
                {isLoading ? (
                  <>
                    <div className="spinner" />
                    <span>Simplifying...</span>
                  </>
                ) : (
                  <>
                    <ArrowDown className="w-3 h-3" />
                    <span>Simplify More</span>
                  </>
                )}
              </button>
            )}
            {currentLevel === 5 && (
              <span className="flex items-center gap-1 text-sm text-green-500">
                <Check className="w-4 h-4" />
                Simplest level
              </span>
            )}
          </div>
        </div>

        {error && (
          <div className="text-red-500 text-sm mb-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
            {error}
          </div>
        )}

        {/* Simplified content preview */}
        <div>
          <WikiContent
            content={displayContent}
            onConceptClick={onConceptClick}
          />
        </div>
      </div>
    </div>
  );
}

