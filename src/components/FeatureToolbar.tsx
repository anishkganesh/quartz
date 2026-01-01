"use client";

import {
  Sparkles,
  Radio,
  Volume2,
  Gamepad2,
  MessageCircle,
} from "lucide-react";
import SpeechToText from "./SpeechToText";

export type FeatureType =
  | "simplify"
  | "tiktok"
  | "podcast"
  | "audio"
  | "video"
  | "quiz"
  | "chat"
  | null;

interface FeatureToolbarProps {
  activeFeature: FeatureType;
  onFeatureClick: (feature: FeatureType) => void;
  onSpeechQuestion?: (question: string) => void;
  onSpeechTopic?: (topic: string) => void;
}

// Features before mic (Simplify, Audify, Chat)
const featuresBeforeMic = [
  { id: "simplify" as const, icon: Sparkles, label: "Simplify" },
  { id: "audio" as const, icon: Volume2, label: "Audify" },
  { id: "chat" as const, icon: MessageCircle, label: "Chat" },
];

// Features after mic (Gamify, Podify)
const featuresAfterMic = [
  { id: "quiz" as const, icon: Gamepad2, label: "Gamify" },
  { id: "podcast" as const, icon: Radio, label: "Podify" },
];

export default function FeatureToolbar({
  activeFeature,
  onFeatureClick,
  onSpeechQuestion,
  onSpeechTopic,
}: FeatureToolbarProps) {
  const renderButton = (feature: { id: FeatureType; icon: typeof Sparkles; label: string }) => {
    const Icon = feature.icon;
    const isActive = activeFeature === feature.id;

    return (
      <button
        key={feature.id as string}
        onClick={() => onFeatureClick(isActive ? null : feature.id)}
        className={`toolbar-btn ${isActive ? "active" : ""}`}
        aria-label={feature.label}
      >
        <Icon className="w-4 h-4" />
      </button>
    );
  };

  return (
    <div className="feature-toolbar">
      {/* Simplify, Audify, Chat */}
      {featuresBeforeMic.map(renderButton)}
      
      {/* Speech-to-Text Mic Button (after Chat) */}
      {onSpeechQuestion && onSpeechTopic && (
        <SpeechToText
          onQuestion={onSpeechQuestion}
          onTopic={onSpeechTopic}
        />
      )}
      
      {/* Gamify, Podcastify, TikTokify, Videofy */}
      {featuresAfterMic.map(renderButton)}
    </div>
  );
}
