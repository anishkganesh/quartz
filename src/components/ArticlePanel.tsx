"use client";

import { useEffect, useState, useCallback } from "react";
import { X, Sparkles } from "lucide-react";
import WikiContent from "./WikiContent";
import { getFromCache, saveToCache, saveSimplifiedToCache } from "@/lib/cache";

interface ArticlePanelProps {
  topic: string;
  isRoot?: boolean;
  width: string;
  onConceptClick: (concept: string) => void;
  onClose?: () => void;
  zIndex: number;
}

export default function ArticlePanel({
  topic,
  isRoot = false,
  width,
  onConceptClick,
  onClose,
  zIndex,
}: ArticlePanelProps) {
  const [content, setContent] = useState<string>("");
  const [simplifiedContent, setSimplifiedContent] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSimplifying, setIsSimplifying] = useState(false);
  const [showSimplified, setShowSimplified] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayTopic = topic.replace(/_/g, " ");

  // Load content
  useEffect(() => {
    async function loadContent() {
      setIsLoading(true);
      setError(null);
      setShowSimplified(false);
      setSimplifiedContent("");

      // Check cache first
      const cached = getFromCache(topic);
      if (cached) {
        setContent(cached.content);
        if (cached.simplifiedContent) {
          setSimplifiedContent(cached.simplifiedContent);
        }
        setIsLoading(false);
        return;
      }

      // Generate new content
      try {
        const response = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topic }),
        });

        if (!response.ok) {
          throw new Error("Failed to generate article");
        }

        const data = await response.json();
        setContent(data.content);
        saveToCache(topic, data.content);
      } catch (err) {
        setError("Failed to load article. Please try again.");
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    }

    if (topic) {
      loadContent();
    }
  }, [topic]);

  const handleSimplify = useCallback(async () => {
    if (showSimplified) {
      setShowSimplified(false);
      return;
    }

    // Check if we already have simplified content
    if (simplifiedContent) {
      setShowSimplified(true);
      return;
    }

    setIsSimplifying(true);

    try {
      const response = await fetch("/api/simplify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, topic }),
      });

      if (!response.ok) {
        throw new Error("Failed to simplify article");
      }

      const data = await response.json();
      setSimplifiedContent(data.content);
      saveSimplifiedToCache(topic, data.content);
      setShowSimplified(true);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSimplifying(false);
    }
  }, [content, topic, simplifiedContent, showSimplified]);

  return (
    <div
      className="panel animate-slide-in"
      style={{ width, zIndex }}
    >
      <div className="p-6 md:p-8 lg:p-10">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex-1">
            <h1 className="capitalize">{displayTopic}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSimplify}
              disabled={isLoading || isSimplifying}
              className={`simplify-btn ${showSimplified ? "active" : ""}`}
              title={showSimplified ? "Show original" : "Simplify for easier reading"}
            >
              {isSimplifying ? (
                <>
                  <div className="spinner" />
                  <span>Simplifying...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>{showSimplified ? "Original" : "Simplify"}</span>
                </>
              )}
            </button>
            {!isRoot && onClose && (
              <button onClick={onClose} className="close-btn" title="Close panel">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="space-y-4">
            <div className="skeleton h-4 w-full" />
            <div className="skeleton h-4 w-full" />
            <div className="skeleton h-4 w-5/6" />
            <div className="skeleton h-4 w-full" />
            <div className="skeleton h-8 w-1/3 mt-8" />
            <div className="skeleton h-4 w-full" />
            <div className="skeleton h-4 w-full" />
            <div className="skeleton h-4 w-4/5" />
          </div>
        ) : error ? (
          <div className="text-center py-16">
            <p className="text-foreground-muted">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 border border-border rounded-lg hover:border-foreground-muted transition-colors"
            >
              Try Again
            </button>
          </div>
        ) : showSimplified && simplifiedContent ? (
          <div className="simplify-container">
            <div className="simplify-original pr-6">
              <div className="simplify-header">Original</div>
              <WikiContent content={content} onConceptClick={onConceptClick} />
            </div>
            <div className="simplify-simple pl-6">
              <div className="simplify-header">Simplified (5-year-old friendly)</div>
              <WikiContent content={simplifiedContent} onConceptClick={onConceptClick} />
            </div>
          </div>
        ) : (
          <WikiContent content={content} onConceptClick={onConceptClick} />
        )}
      </div>
    </div>
  );
}

