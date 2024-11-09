"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Conversation } from "@11labs/client";
import { useState } from "react";

// SpeechRecognition types
interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  readonly confidence: number;
  readonly transcript: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  serviceURI: string;
  onaudiostart: (event: Event) => void;
  onaudioend: (event: Event) => void;
  onend: (event: Event) => void;
  onerror: (event: SpeechRecognitionErrorEvent) => void;
  onnomatch: (event: SpeechRecognitionEvent) => void;
  onresult: (event: SpeechRecognitionEvent) => void;
  onsoundstart: (event: Event) => void;
  onsoundend: (event: Event) => void;
  onspeechstart: (event: Event) => void;
  onspeechend: (event: Event) => void;
  onstart: (event: Event) => void;
  abort(): void;
  start(): void;
  stop(): void;
}

// Check for browser support, only works in Chrome
const SpeechRecognition =
  typeof window !== "undefined" &&
  ((window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition);
const recognition: SpeechRecognition | null = SpeechRecognition
  ? new SpeechRecognition()
  : null;
console.log("SpeechRecognition working >>>", SpeechRecognition);

async function requestMicrophonePermission() {
  try {
    await navigator.mediaDevices.getUserMedia({ audio: true });
    return true;
  } catch {
    console.error("Microphone permission denied");
    return false;
  }
}

async function getSignedUrl(): Promise<string> {
  const response = await fetch("/api/signed-url");
  if (!response.ok) {
    throw Error("Failed to get signed url");
  }
  const data = await response.json();
  return data.signedUrl;
}

export function ConvAI() {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [conversation2, setConversation2] = useState<Conversation | null>(null);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isConnected2, setIsConnected2] = useState(false);
  const [isSpeaking2, setIsSpeaking2] = useState(false);

  const [agentTranscript, setAgentTranscript] = useState<string>("");
  const [transcript, setTranscript] = useState<string>("");
  const [isRecognitionActive, setIsRecognitionActive] = useState(false);

  // Initialize speech recognition
  if (recognition) {
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcriptPart = event.results[i][0].transcript;
        if (event.results[i].isFinal) {          
        } else {
          interimTranscript += transcriptPart;
        }
      }

      if (isUserSpeaking) {
        setTranscript(interimTranscript);
      } else {
        setAgentTranscript(interimTranscript);
      }


      console.log(
        "speechRecognition::onresult::Interim Transcript (agent & user):",
        interimTranscript
      );
      console.log(
        "speechRecognition::onresult::User Transcript:",
        transcript
      );
      console.log(
        "speechRecognition::onresult::Agent Transcript:",
        agentTranscript
      );
    };

    recognition.onstart = (event: Event) => {
      setTranscript("");
      setIsRecognitionActive(true);
      console.log("speechRecognition::onstart::Speech recognition started");
    };

    recognition.onerror = (event: any) => {
      console.error(
        "speechRecognition::onerror::Speech recognition error detected: " +
          event.error
      );
      setIsRecognitionActive(false);
    };

    recognition.onspeechend = (event: Event) => {
      setTranscript("");
      setIsRecognitionActive(false);
      console.log("speechRecognition::onspeechend::Speech recognition ended");
    };
  }

  function startSpeechRecognition() {
    if (recognition) {
      recognition.start();
      setIsRecognitionActive(true);
    } else if (!recognition) {
      alert("Speech recognition not supported in this browser.");
    }
  }

  function stopSpeechRecognition() {
    if (recognition) {
      recognition.stop();
      setIsRecognitionActive(false);
      setIsUserSpeaking(false);
    }
  }

  async function startConversation() {
    const hasPermission = await requestMicrophonePermission();
    if (!hasPermission) {
      alert("No permission");
      return;
    }

    const conversation = await Conversation.startSession({
      agentId: "HZxr3eErj3VsZi8TKms4",
      onConnect: () => {
        setIsConnected(true);
        startSpeechRecognition();
        console.log("11labs::conversation::onConnect");
      },
      onDisconnect: () => {
        setIsConnected(false);
        setIsSpeaking(false);
        stopSpeechRecognition();
        console.log("11labs::conversation::onDisconnect");
      },
      onError: (error) => {
        console.log(error);
        alert(
          "11labs::conversation::error:An error occurred during the conversation"
        );
      },
      onModeChange: ({ mode }) => {
        console.log("11labs::conversation::onModeChange:mode:", mode);

        if (mode === "speaking") {
          setIsUserSpeaking(false);
          // stopSpeechRecognition();
        }

        if (mode === "listening") {
          setIsUserSpeaking(true);
          // startSpeechRecognition();
        }

        const currentMinutes = new Date().getMinutes();
        if (currentMinutes % 2 === 0) {
          setIsSpeaking(true);
          setIsSpeaking2(false);
          conversation?.setVolume({ volume: 0.5 });
          conversation2?.setVolume({ volume: 0.5 });
        } else {
          setIsSpeaking(false);
          setIsSpeaking2(true);
          conversation?.setVolume({ volume: 0.5 });
          conversation2?.setVolume({ volume: 0.5 });
        }
      },
    });
    setConversation(conversation);
  }

  async function startBothConversations() {
    await startConversation();
    const conversation2 = await Conversation.startSession({
      agentId: "juZb7Lt8KJdZMRsdru1y",
      onConnect: () => {
        setIsConnected2(true);
      },
      onDisconnect: () => {
        setIsConnected2(false);
        setIsSpeaking2(false);
      },
      onError: (error) => {
        console.log(error);
        alert("An error occurred during the conversation");
      },
      onModeChange: ({ mode }) => {
        const currentMinutes = new Date().getMinutes();
        if (currentMinutes % 2 === 0) {
          setIsSpeaking(true);
          setIsSpeaking2(false);
          conversation?.setVolume({ volume: 0.5 });
          conversation2?.setVolume({ volume: 0.5 });
        } else {
          setIsSpeaking(false);
          setIsSpeaking2(true);
          conversation?.setVolume({ volume: 0.5 });
          conversation2?.setVolume({ volume: 0.5 });
        }
      },
    });
    setConversation2(conversation2);
  }

  function randomlySelectAgentToSpeak() {
    const currentMinutes = new Date().getMinutes();
    if (currentMinutes % 2 === 0) {
      setIsSpeaking(true);
      setIsSpeaking2(false);
    } else {
      setIsSpeaking(false);
      setIsSpeaking2(true);
    }
  }

  async function endConversation() {
    if (conversation) {
      await conversation.endSession();
      setConversation(null);
    }
    if (conversation2) {
      await conversation2.endSession();
      setConversation2(null);
    }
  }

  return (
    <div className={"flex justify-center items-center gap-x-4"}>
      <div className={"flex flex-col gap-y-4 text-center"}>
        <Button
          variant={"outline"}
          className={"rounded-full"}
          size={"lg"}
          // onClick={startSpeechRecognition}
        >
          Start Speech Recognition
        </Button>
        <Button
          variant={"outline"}
          className={"rounded-full"}
          size={"lg"}
          // onClick={stopSpeechRecognition}
        >
          Stop Speech Recognition
        </Button>
      </div>

      <Card className={"rounded-3xl"}>
        <CardContent>
          <CardHeader>
            <CardTitle className={"text-center"}>
              {isConnected
                ? isSpeaking
                  ? `Agent 1 is speaking`
                  : "Agent 1 is listening"
                : "Agent 1 Disconnected"}
            </CardTitle>
          </CardHeader>
          <div className={"flex flex-col gap-y-4 text-center"}>
            <div
              className={cn(
                "orb my-16 mx-12",
                isSpeaking ? "animate-orb" : conversation && "animate-orb-slow",
                isConnected ? "orb-active" : "orb-inactive"
              )}
            ></div>
          </div>
        </CardContent>
      </Card>

      <Card className={"rounded-3xl"}>
        <CardContent>
          <CardHeader>
            <CardTitle className={"text-center"}>
              {isConnected2
                ? isSpeaking2
                  ? `Agent 2 is speaking`
                  : "Agent 2 is listening"
                : "Agent 2 Disconnected"}
            </CardTitle>
          </CardHeader>
          <div className={"flex flex-col gap-y-4 text-center"}>
            <div
              className={cn(
                "orb my-16 mx-12",
                isSpeaking2
                  ? "animate-orb"
                  : conversation2 && "animate-orb-slow",
                isConnected2 ? "orb-active" : "orb-inactive"
              )}
            ></div>
          </div>
        </CardContent>
      </Card>

      <div className={"flex flex-col gap-y-4 text-center"}>
        <Button
          variant={"outline"}
          className={"rounded-full"}
          size={"lg"}
          disabled={conversation !== null && isConnected}
          onClick={startConversation}
        >
          Start conversation 1
        </Button>
        <Button
          variant={"outline"}
          className={"rounded-full"}
          size={"lg"}
          disabled={conversation2 !== null && isConnected2}
          onClick={startBothConversations}
        >
          Start both conversations
        </Button>
        <Button
          variant={"outline"}
          className={"rounded-full"}
          size={"lg"}
          disabled={
            conversation === null &&
            !isConnected &&
            conversation2 === null &&
            !isConnected2
          }
          onClick={endConversation}
        >
          End conversation
        </Button>
      </div>
    </div>
  );
}
