"use client";

import { useState, useRef, useEffect } from "react";
import { Copy, MessageCircle, X } from "lucide-react";

interface TextSelectionPopupProps {
  selectedText: string;
  x: number;
  y: number;
  onAskGpt: (question: string) => void;
  onClose: () => void;
}

export default function TextSelectionPopup({
  selectedText,
  x,
  y,
  onAskGpt,
  onClose,
}: TextSelectionPopupProps) {
  const [copied, setCopied] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);

  // Adjust position to stay within viewport
  const [position, setPosition] = useState({ x, y });

  useEffect(() => {
    if (popupRef.current) {
      const popup = popupRef.current;
      const rect = popup.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let adjustedX = x - rect.width / 2;
      let adjustedY = y;

      // Keep within horizontal bounds
      if (adjustedX < 12) adjustedX = 12;
      if (adjustedX + rect.width > viewportWidth - 12) {
        adjustedX = viewportWidth - rect.width - 12;
      }

      // Keep within vertical bounds
      if (adjustedY + rect.height > viewportHeight - 12) {
        adjustedY = y - rect.height - 40; // Position above selection
      }

      setPosition({ x: adjustedX, y: adjustedY });
    }
  }, [x, y]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(selectedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  // Immediately open chat with quoted text
  const handleAskClick = () => {
    const quotedText = `"${selectedText}"`;
    onAskGpt(quotedText);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    }
  };

  // Prevent popup from closing when interacting with it
  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <div
      ref={popupRef}
      className="text-selection-popup"
      style={{
        left: position.x,
        top: position.y,
      }}
      onKeyDown={handleKeyDown}
      onMouseDown={handleMouseDown}
    >
      <div className="text-selection-actions">
        <button onClick={handleCopy} className="text-selection-btn">
          <Copy className="w-3 h-3" />
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
        <button onClick={handleAskClick} className="text-selection-btn">
          <MessageCircle className="w-3 h-3" />
          <span>Ask GPT</span>
        </button>
        <button
          onClick={onClose}
          className="text-selection-btn"
          style={{ padding: "0.35rem" }}
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
