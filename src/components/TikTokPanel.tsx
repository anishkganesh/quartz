"use client";

import { useState, useEffect, useRef } from "react";
import { X } from "lucide-react";

interface TikTokPanelProps {
  topic: string;
  content: string;
  onClose: () => void;
  cachedScript?: string;
  onScriptGenerated?: (script: string) => void;
}

export default function TikTokPanel({
  topic,
  content,
  onClose,
  cachedScript,
  onScriptGenerated,
}: TikTokPanelProps) {
  const [script, setScript] = useState<string | null>(cachedScript || null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasGeneratedRef = useRef(false);

  useEffect(() => {
    // Use cached script if available
    if (cachedScript) {
      setScript(cachedScript);
      hasGeneratedRef.current = true;
    } else if (!hasGeneratedRef.current && !script) {
      generateContent();
    }
  }, [topic, cachedScript]);

  const generateContent = async () => {
    setIsLoading(true);
    setError(null);
    hasGeneratedRef.current = true;

    try {
      const response = await fetch("/api/tiktokify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, content }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate content");
      }

      const data = await response.json();
      const generatedScript = data.script || data.prompt;
      setScript(generatedScript);
      onScriptGenerated?.(generatedScript);
    } catch (err) {
      setError("Failed to generate content. Please try again.");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="feature-panel">
      <div className="feature-panel-header">
        <h3 className="feature-panel-title">TikTokify</h3>
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
            <button
              onClick={generateContent}
              className="pill-btn text-sm"
            >
              Try Again
            </button>
          </div>
        ) : script ? (
          <div className="prose prose-sm max-w-none">
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {script}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
