"use client";

import { useEffect } from "react";
import SearchAutocomplete from "@/components/SearchAutocomplete";
import ThemeToggle from "@/components/ThemeToggle";
import AuthButton from "@/components/AuthButton";

export default function Home() {
  // Initialize theme on mount
  useEffect(() => {
    const stored = localStorage.getItem("theme");
    if (stored === "dark" || stored === "light") {
      document.documentElement.setAttribute("data-theme", stored);
    } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      document.documentElement.setAttribute("data-theme", "dark");
    }
  }, []);

  return (
    <div className="home-container">
      {/* Top right corner - auth and theme toggle */}
      <div className="fixed top-4 right-4 flex items-center gap-2">
        <AuthButton />
        <ThemeToggle />
      </div>

      {/* Main content - search box at vertical center */}
      <div className="home-content">
        <h1 className="home-logo">Quartz</h1>
        <SearchAutocomplete
          autoFocus
          placeholder=""
        />
      </div>
    </div>
  );
}
