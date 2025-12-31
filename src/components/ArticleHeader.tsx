"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Home, Search, Loader2 } from "lucide-react";
import ThemeToggle from "./ThemeToggle";
import SearchModal from "./SearchModal";
import Breadcrumbs, { BreadcrumbItem } from "./Breadcrumbs";
import { getRecentTopics } from "@/lib/cache";

interface ArticleHeaderProps {
  breadcrumbs: BreadcrumbItem[];
  onBreadcrumbNavigate: (index: number) => void;
}

export default function ArticleHeader({
  breadcrumbs,
  onBreadcrumbNavigate,
}: ArticleHeaderProps) {
  const router = useRouter();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Handle Cmd+K / Ctrl+K
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      inputRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Fetch AI suggestions with debounce
  const fetchAISuggestions = useCallback(async (query: string) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    setIsLoadingAI(true);

    try {
      const response = await fetch("/api/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) throw new Error("API error");

      const data = await response.json();
      if (data.suggestions && data.suggestions.length > 0) {
        setSuggestions(data.suggestions);
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        console.error("AI suggest error:", err);
      }
    } finally {
      setIsLoadingAI(false);
    }
  }, []);

  // Update suggestions when query changes
  useEffect(() => {
    if (searchQuery.trim().length > 0) {
      // Show local suggestions immediately
      const recent = getRecentTopics(20);
      const recentNames = recent.map((t) => t.name);
      const filtered = recentNames.filter((topic) =>
        topic.toLowerCase().includes(searchQuery.toLowerCase())
      );
      const localSuggestions = [searchQuery, ...filtered].filter((v, i, a) => a.indexOf(v) === i).slice(0, 8);
      setSuggestions(localSuggestions);
      setShowDropdown(true);
      setSelectedIndex(-1);

      // Clear previous debounce timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // Debounce AI suggestions (300ms)
      debounceTimerRef.current = setTimeout(() => {
        fetchAISuggestions(searchQuery);
      }, 300);
    } else {
      setShowDropdown(false);
      setSuggestions([]);
      setIsLoadingAI(false);
    }

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [searchQuery, fetchAISuggestions]);

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

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev < suggestions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const topic = selectedIndex >= 0 ? suggestions[selectedIndex] : searchQuery;
      if (topic.trim()) {
        navigateToTopic(topic);
      }
    } else if (e.key === "Escape") {
      setShowDropdown(false);
      inputRef.current?.blur();
    }
  };

  const navigateToTopic = (topic: string) => {
    const formattedTopic = topic.trim().replace(/\s+/g, "_");
    router.push(`/page/${encodeURIComponent(formattedTopic)}`);
    setSearchQuery("");
    setShowDropdown(false);
  };

  return (
    <>
      <header className="header">
        <div className="header-left">
          <Link href="/" className="header-logo">
            <Home className="w-4 h-4" />
            <span>Quartz</span>
          </Link>
          
          {breadcrumbs.length > 0 && (
            <Breadcrumbs
              items={breadcrumbs}
              onNavigate={onBreadcrumbNavigate}
            />
          )}
        </div>

        <div className="header-right">
          {/* Circular Search Input */}
          <div className="header-search-wrapper">
            <Search className="header-search-icon" />
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleInputKeyDown}
              onFocus={() => searchQuery.trim() && setShowDropdown(true)}
              onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
              placeholder="Search... ⌘K"
              className="header-search"
            />
            {isLoadingAI && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 animate-spin text-foreground-muted" />
            )}
            
            {showDropdown && suggestions.length > 0 && (
              <div className="search-dropdown">
                {suggestions.map((suggestion, index) => (
                  <div
                    key={suggestion}
                    className={`search-item ${
                      index === selectedIndex ? "selected" : ""
                    }`}
                    onMouseDown={() => navigateToTopic(suggestion)}
                    onMouseEnter={() => setSelectedIndex(index)}
                  >
                    {suggestion}
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <ThemeToggle />
        </div>
      </header>

      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
      />
    </>
  );
}
