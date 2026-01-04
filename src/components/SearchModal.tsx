"use client";

import { useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import SearchAutocomplete from "./SearchAutocomplete";

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SearchModal({ isOpen, onClose }: SearchModalProps) {
  // Handle escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  // Use portal to render at document root
  return createPortal(
    <div className="search-modal-overlay" onClick={onClose}>
      <div
        className="search-modal animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <SearchAutocomplete
          autoFocus
          placeholder="Search any topic..."
          variant="modal"
          onSelect={onClose}
        />
      </div>
    </div>,
    document.body
  );
}


