"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2 } from "lucide-react";
import { getRecentTopics } from "@/lib/cache";

const SUGGESTED_TOPICS = [
  "Quantum Mechanics",
  "Artificial Intelligence",
  "Black Holes",
  "Theory of Relativity",
  "Photosynthesis",
  "DNA Replication",
  "Climate Change",
  "Blockchain",
  "Neural Networks",
  "Evolution",
  "Thermodynamics",
  "Electromagnetic Radiation",
  "Renaissance",
  "World War II",
  "The Big Bang",
];

interface SearchAutocompleteProps {
  autoFocus?: boolean;
  placeholder?: string;
  variant?: "home" | "modal";
  onSelect?: () => void;
  onQueryChange?: (query: string) => void;
}

export default function SearchAutocomplete({
  autoFocus = false,
  placeholder = "Search any topic...",
  variant = "home",
  onSelect,
  onQueryChange,
}: SearchAutocompleteProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const router = useRouter();

  // Get local suggestions immediately
  const getLocalSuggestions = useCallback((searchQuery: string) => {
    const lowerQuery = searchQuery.toLowerCase();
    const recent = getRecentTopics(3);
    const recentNames = recent.map((t) => t.name);
    const recentMatches = recentNames.filter((t) =>
      t.toLowerCase().includes(lowerQuery)
    );
    const suggestedMatches = SUGGESTED_TOPICS.filter(
      (topic) =>
        topic.toLowerCase().includes(lowerQuery) &&
        !recentMatches.includes(topic)
    );

    return [
      searchQuery,
      ...recentMatches,
      ...suggestedMatches.slice(0, 5),
    ].filter((v, i, a) => a.indexOf(v) === i).slice(0, 8);
  }, []);

  // Fetch AI suggestions with debounce
  const fetchAISuggestions = useCallback(async (searchQuery: string) => {
    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller
    abortControllerRef.current = new AbortController();
    setIsLoadingAI(true);

    try {
      const response = await fetch("/api/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) throw new Error("API error");

      const data = await response.json();
      if (data.suggestions && data.suggestions.length > 0) {
        setSuggestions(data.suggestions);
      }
    } catch (err) {
      // Silently fail - local suggestions are already showing
      if ((err as Error).name !== "AbortError") {
        console.error("AI suggest error:", err);
      }
    } finally {
      setIsLoadingAI(false);
    }
  }, []);

  // Generate suggestions based on query
  useEffect(() => {
    if (!query.trim()) {
      setSuggestions([]);
      setIsOpen(false);
      setIsLoadingAI(false);
      return;
    }

    // Show local suggestions immediately
    const localResults = getLocalSuggestions(query);
    setSuggestions(localResults);
    setSelectedIndex(0);
    setIsOpen(true);

    // Clear previous debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Debounce AI suggestions (300ms)
    debounceTimerRef.current = setTimeout(() => {
      fetchAISuggestions(query);
    }, 300);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [query, getLocalSuggestions, fetchAISuggestions]);

  const navigateToTopic = useCallback(
    (topic: string) => {
      const formattedTopic = topic.trim().replace(/\s+/g, "_");
      router.push(`/page/${encodeURIComponent(formattedTopic)}`);
      setIsOpen(false);
      setQuery("");
      onSelect?.();
    },
    [router, onSelect]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen || suggestions.length === 0) {
        if (e.key === "Enter" && query.trim()) {
          navigateToTopic(query);
        }
        return;
      }

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < suggestions.length - 1 ? prev + 1 : prev
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
          break;
        case "Enter":
          e.preventDefault();
          if (suggestions[selectedIndex]) {
            navigateToTopic(suggestions[selectedIndex]);
          }
          break;
        case "Escape":
          setIsOpen(false);
          break;
      }
    },
    [isOpen, suggestions, selectedIndex, query, navigateToTopic]
  );

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const isModal = variant === "modal";

  return (
    <div ref={containerRef} className={isModal ? "w-full" : "search-wrapper"}>
      <div className="relative">
        {!isModal && (
          <Search className="search-icon" />
        )}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            onQueryChange?.(e.target.value);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className={isModal ? "search-modal-input" : "search-circular"}
        />
        {isLoadingAI && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-foreground-muted" />
        )}
      </div>

      {isOpen && suggestions.length > 0 && (
        <div className={isModal ? "search-modal-results" : "search-dropdown"}>
          {suggestions.map((suggestion, index) => (
            <div
              key={`${suggestion}-${index}`}
              className={`search-item ${index === selectedIndex ? "selected" : ""}`}
              onClick={() => navigateToTopic(suggestion)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              {index === 0 && suggestion === query ? (
                <span>
                  Search for &quot;<span className="font-medium">{suggestion}</span>&quot;
                </span>
              ) : (
                <span>{suggestion}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
