import { useState, useCallback } from "react";

export function useSpeech() {
  const [speaking, setSpeaking] = useState(false);

  const speak = useCallback((text: string, lang: "en-US" | "en-GB" = "en-US") => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 0.9;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }, []);

  return { speaking, speak };
}
