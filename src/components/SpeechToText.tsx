"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, Loader2 } from "lucide-react";

interface SpeechToTextProps {
  onQuestion: (question: string) => void;
  onTopic: (topic: string) => void;
}

const SILENCE_THRESHOLD = 0.01; // Audio level below this is considered silence (lowered for sensitivity)
const SILENCE_DURATION = 1200; // 1.2 seconds of silence triggers processing
const MIN_SPEECH_DURATION = 600; // Minimum speech duration for valid audio
const MIN_BLOB_SIZE = 3000; // Minimum blob size in bytes

// Common Whisper hallucinations to filter out
const HALLUCINATION_PHRASES = [
  "thank you",
  "thanks for watching",
  "thanks for listening", 
  "subscribe",
  "like and subscribe",
  "see you next time",
  "bye",
  "goodbye",
  "you",
];

// Get the best supported audio mimeType
function getSupportedMimeType(): string {
  const types = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return "audio/webm"; // fallback
}

export default function SpeechToText({ onQuestion, onTopic }: SpeechToTextProps) {
  const [isActive, setIsActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Use refs to avoid stale closure issues
  const isActiveRef = useRef(false);
  const isProcessingRef = useRef(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>("audio/webm");
  
  const silenceStartRef = useRef<number | null>(null);
  const speechStartRef = useRef<number | null>(null);
  const hasSpeechRef = useRef(false);
  const animationFrameRef = useRef<number | null>(null);
  const keepAliveIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Process audio and send to API
  const processAudio = useCallback(async () => {
    console.log("[STT] processAudio called, chunks:", chunksRef.current.length);
    if (chunksRef.current.length === 0) return;
    
    const mimeType = mimeTypeRef.current;
    const audioBlob = new Blob(chunksRef.current, { type: mimeType });
    chunksRef.current = []; // Clear for next recording
    
    console.log("[STT] Audio blob size:", audioBlob.size, "bytes, type:", mimeType);
    
    // Skip audio too small to be valid
    if (audioBlob.size < MIN_BLOB_SIZE) {
      console.log("[STT] Skipping - audio too small (need", MIN_BLOB_SIZE, "bytes)");
      return;
    }

    setIsProcessing(true);
    isProcessingRef.current = true;

    try {
      // Determine file extension from mimeType
      let extension = "webm";
      if (mimeType.includes("ogg")) extension = "ogg";
      else if (mimeType.includes("mp4")) extension = "mp4";
      
      const formData = new FormData();
      formData.append("audio", audioBlob, `recording.${extension}`);

      console.log("[STT] Sending to API as", extension, "...");
      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });

      console.log("[STT] API response status:", response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("[STT] API error:", errorText);
        // Don't throw - just log and continue
        return;
      }

      const data = await response.json();
      console.log("[STT] API response:", data);

      // Check for Whisper hallucinations
      const transcript = (data.transcript || "").toLowerCase().trim();
      const isHallucination = HALLUCINATION_PHRASES.some(phrase => 
        transcript === phrase || transcript === phrase + "."
      );
      
      if (isHallucination) {
        console.log("[STT] Filtered hallucination:", transcript);
        return;
      }

      // Only act if we got meaningful content
      if (data.content && data.content.trim().length > 2) {
        console.log("[STT] Acting on:", data.type, data.content);
        if (data.type === "question") {
          onQuestion(data.content);
        } else if (data.type === "topic") {
          onTopic(data.content);
        }
      } else {
        console.log("[STT] No actionable content");
      }
    } catch (error) {
      console.error("[STT] Processing error:", error);
    } finally {
      setIsProcessing(false);
      isProcessingRef.current = false;
      // Reset speech tracking for next utterance
      hasSpeechRef.current = false;
      speechStartRef.current = null;
      silenceStartRef.current = null;
    }
  }, [onQuestion, onTopic]);

  // Monitor audio levels for silence detection
  const monitorAudio = useCallback(() => {
    if (!analyserRef.current || !isActiveRef.current) return;

    const analyser = analyserRef.current;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);

    // Calculate average audio level (normalized 0-1)
    const sum = dataArray.reduce((a, b) => a + b, 0);
    const average = sum / dataArray.length / 255;
    const now = Date.now();

    if (average > SILENCE_THRESHOLD) {
      // Speech detected
      if (!hasSpeechRef.current) {
        hasSpeechRef.current = true;
        speechStartRef.current = now;
        console.log("[STT] Speech started");
      }
      silenceStartRef.current = null;
    } else {
      // Silence detected
      if (hasSpeechRef.current && !silenceStartRef.current) {
        silenceStartRef.current = now;
      }

      // Check if we've had enough silence after speech
      if (
        hasSpeechRef.current &&
        silenceStartRef.current &&
        speechStartRef.current &&
        now - silenceStartRef.current >= SILENCE_DURATION &&
        now - speechStartRef.current >= MIN_SPEECH_DURATION &&
        !isProcessingRef.current
      ) {
        // Stop current recording segment and process
        console.log("[STT] Silence detected after speech, stopping to process...");
        if (mediaRecorderRef.current?.state === "recording") {
          mediaRecorderRef.current.stop();
        }
        return; // Don't continue animation frame - will restart after processing
      }
    }

    animationFrameRef.current = requestAnimationFrame(monitorAudio);
  }, []);

  // Start recording
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        } 
      });
      streamRef.current = stream;

      // Set up audio analysis
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.3;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Get best supported mimeType
      const mimeType = getSupportedMimeType();
      mimeTypeRef.current = mimeType;
      console.log("[STT] Using mimeType:", mimeType);

      // Set up media recorder
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Process the audio
        await processAudio();
        
        // Restart recording if still active
        if (isActiveRef.current && streamRef.current && mediaRecorderRef.current) {
          chunksRef.current = [];
          try {
            mediaRecorderRef.current.start(100);
            animationFrameRef.current = requestAnimationFrame(monitorAudio);
          } catch (e) {
            console.error("[STT] Failed to restart recording:", e);
          }
        }
      };

      // Set active state BEFORE starting
      setIsActive(true);
      isActiveRef.current = true;

      console.log("[STT] Starting recording...");
      mediaRecorder.start(100); // Get data every 100ms
      
      // Start monitoring
      animationFrameRef.current = requestAnimationFrame(monitorAudio);

      // Keep-alive interval to prevent AudioContext suspension
      keepAliveIntervalRef.current = setInterval(() => {
        if (audioContextRef.current?.state === "suspended") {
          audioContextRef.current.resume();
        }
        // Also ensure animation frame is running
        if (isActiveRef.current && !animationFrameRef.current && !isProcessingRef.current) {
          animationFrameRef.current = requestAnimationFrame(monitorAudio);
        }
      }, 5000);
    } catch (error) {
      console.error("[STT] Failed to start recording:", error);
      alert("Could not access microphone. Please check permissions.");
    }
  }, [processAudio, monitorAudio]);

  // Stop recording completely
  const stopRecording = useCallback(() => {
    console.log("[STT] Stopping recording...");
    // Set inactive first
    setIsActive(false);
    isActiveRef.current = false;

    // Stop keep-alive interval
    if (keepAliveIntervalRef.current) {
      clearInterval(keepAliveIntervalRef.current);
      keepAliveIntervalRef.current = null;
    }

    // Stop animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Stop media recorder
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;

    // Stop audio context
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    // Stop all tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    hasSpeechRef.current = false;
    speechStartRef.current = null;
    silenceStartRef.current = null;
    chunksRef.current = [];
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isActiveRef.current = false;
      if (keepAliveIntervalRef.current) {
        clearInterval(keepAliveIntervalRef.current);
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const handleClick = () => {
    if (isActive) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <button
      onClick={handleClick}
      className="toolbar-btn"
      aria-label={isActive ? "Stop voice input" : "Voice input"}
      title={isActive ? "Stop voice input" : "Voice input"}
    >
      {isProcessing ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Mic className="w-4 h-4" />
      )}
    </button>
  );
}
