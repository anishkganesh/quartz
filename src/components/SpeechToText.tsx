"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, Loader2 } from "lucide-react";

interface SpeechToTextProps {
  onQuestion: (question: string) => void;
  onTopic: (topic: string) => void;
}

const SILENCE_THRESHOLD = 0.03; // Audio level below this is considered silence
const SILENCE_DURATION = 1000; // 1 second of silence triggers processing
const MIN_SPEECH_DURATION = 300; // Minimum speech duration to consider valid

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
  
  const silenceStartRef = useRef<number | null>(null);
  const speechStartRef = useRef<number | null>(null);
  const hasSpeechRef = useRef(false);
  const animationFrameRef = useRef<number | null>(null);

  // Process audio and send to API
  const processAudio = useCallback(async () => {
    if (chunksRef.current.length === 0) return;
    
    const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
    chunksRef.current = []; // Clear for next recording
    
    // Skip very small audio
    if (audioBlob.size < 500) return;

    setIsProcessing(true);
    isProcessingRef.current = true;

    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.webm");

      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Transcription failed");
      }

      const data = await response.json();

      // Only act if we got meaningful content
      if (data.content && data.content.trim().length > 2) {
        if (data.type === "question") {
          onQuestion(data.content);
        } else if (data.type === "topic") {
          onTopic(data.content);
        }
      }
    } catch (error) {
      console.error("Processing error:", error);
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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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

      // Set up media recorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm",
      });
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
            console.error("Failed to restart recording:", e);
          }
        }
      };

      // Set active state BEFORE starting
      setIsActive(true);
      isActiveRef.current = true;

      mediaRecorder.start(100); // Get data every 100ms
      
      // Start monitoring
      animationFrameRef.current = requestAnimationFrame(monitorAudio);
    } catch (error) {
      console.error("Failed to start recording:", error);
      alert("Could not access microphone. Please check permissions.");
    }
  }, [processAudio, monitorAudio]);

  // Stop recording completely
  const stopRecording = useCallback(() => {
    // Set inactive first
    setIsActive(false);
    isActiveRef.current = false;

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
