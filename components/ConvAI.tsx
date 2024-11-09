"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Conversation } from "@11labs/client";
import { useState, useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Mic, Video, PhoneOff } from "lucide-react";

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

// Define a type for the participant
type Participant = {
  id: number;
  name: string;
  avatar: string;
  speaking: boolean;
  agentId: string;
  session: Conversation | null; // Ensure session is of type Conversation or null
};

export function ConvAI() {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [conversation2, setConversation2] = useState<Conversation | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isConnected2, setIsConnected2] = useState(false);
  const [isSpeaking2, setIsSpeaking2] = useState(false);
  const [currentSpeakerId, setCurrentSpeakerId] = useState<number | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([
    {
      id: 1,
      name: "John Doe",
      avatar: "/placeholder.svg?height=40&width=40",
      speaking: false,
      agentId: "K0PRQtUKFWGL4wTjQ1i6",
      session: null,
    },
    {
      id: 2,
      name: "Jane Smith",
      avatar: "/placeholder.svg?height=40&width=40",
      speaking: false,
      agentId: "RdcFm7gBumcTAb8zgExV",
      session: null,
    },
    // Add agent IDs for other participants as needed
  ]);
  const [time, setTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    console.log(`currentSpeakerId: ${currentSpeakerId}`);
  }, [currentSpeakerId]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRunning) {
      interval = setInterval(() => {
        setTime((prevTime) => prevTime + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRunning]);

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleCommand = (action: string) => {
    switch (action) {
      case "start":
        startAllConversations();
        setIsRunning(true);
        break;
      case "resume":
        setIsRunning(true);
        break;
      case "pause":
        setIsRunning(false);
        break;
      case "finish":
        setIsRunning(false);
        endConversation();
        break;
    }
  };

  async function startAllConversations() {
    const hasPermission = await requestMicrophonePermission();
    if (!hasPermission) {
      alert("No permission");
      return;
    }

    const updatedParticipants = await Promise.all(
      participants.map(async (participant) => {
        const session = await Conversation.startSession({
          agentId: participant.agentId,
          onConnect: () => {
            setIsConnected(true);
          },
          onDisconnect: () => {
            setIsConnected(false);
            setIsSpeaking(false);
          },
          onError: (error) => {
            console.log(error);
            alert("An error occurred during the conversation");
          },
          onModeChange: ({ mode }) => {
            setParticipants((prevParticipants) =>
              prevParticipants.map((p) => {
                console.log(`onModeChange: ${p.id} ${mode}`);
                if (p.id === participant.id) {
                  if (mode === "speaking") {
                    if (currentSpeakerId === null) {
                      setCurrentSpeakerId(p.id);
                      p.session?.setVolume({ volume: 0.5 });
                      return { ...p, speaking: true, volume: 0.5 };
                    }
                  } else if (mode === "listening") {
                    if (currentSpeakerId === p.id) {
                      setCurrentSpeakerId(null);
                      p.session?.setVolume({ volume: 0 });
                      return { ...p, speaking: false, volume: 0 };
                    }
                  }
                }
                return p;
              })
            );
          },
        });
        return { ...participant, session };
      })
    );

    setParticipants(updatedParticipants);
  }

  function randomlySelectAgentToSpeak() {
    const currentMinutes = new Date().getMinutes();
    setParticipants((prevParticipants) =>
      prevParticipants.map((participant, index) => ({
        ...participant,
        speaking: index % 2 === currentMinutes % 2,
      }))
    );
  }

  async function endConversation() {
    for (const participant of participants) {
      if (participant.session) {
        await participant.session.endSession();
      }
    }
    setParticipants((prevParticipants) =>
      prevParticipants.map((participant) => ({
        ...participant,
        session: null,
        speaking: false,
      }))
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col dark">
      <main className="flex flex-grow p-4 overflow-auto  h-full items-center justify-center">
        <div
          className="flex flex-wrap gap-4 justify-center items-center h-full"
          style={{ height: "100%" }}
        >
          {participants.map((participant) => (
            <Card
              key={participant.id}
              className={cn(
                "bg-card text-card-foreground min-w-[200px] sm:min-w-[300px] md:min-w-[500px]",
                participant.speaking ? "border-blue-500" : ""
              )}
            >
              <CardContent className="p-4">
                <div className="aspect-video bg-muted rounded-lg mb-2"></div>
                <div className="flex items-center gap-2">
                  <Avatar>
                    <AvatarImage
                      src={participant.avatar}
                      alt={participant.name}
                    />
                    <AvatarFallback>
                      {participant.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </AvatarFallback>
                  </Avatar>
                  <span className="font-medium">{participant.name}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
      <div className="border-t border-border p-4 flex flex-col sm:flex-row gap-4">
        <Card className="flex-grow bg-card text-card-foreground">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="aspect-video bg-muted rounded-lg w-40"></div>
            <div>
              <h3 className="font-semibold">Your Video</h3>
              <p className="text-sm text-muted-foreground">You</p>
            </div>
            <div className="ml-auto flex gap-2">
              <Button size="icon" variant="outline">
                <Mic className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="outline">
                <Video className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="destructive">
                <PhoneOff className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
        <Card className="w-full sm:w-auto bg-card text-card-foreground">
          <CardContent className="p-4">
            <div className="text-2xl font-bold mb-2">{formatTime(time)}</div>
            <div>
              <Button onClick={() => handleCommand("start")} className="m-1">
                Start
              </Button>
              <Button onClick={() => handleCommand("pause")} className="m-1">
                Pause
              </Button>
              <Button onClick={() => handleCommand("resume")} className="m-1">
                Resume
              </Button>
              <Button onClick={() => handleCommand("finish")} className="m-1">
                Finish
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>{" "}
    </div>
  );
}
