"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Conversation } from "@11labs/client";
import { useState, useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Mic, Video, PhoneOff } from "lucide-react";
import { useParams } from "next/navigation";

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

// Define a type for the agents table
type Agent = {
  id: string; // uuid
  created_at: string; // timestamp with time zone
  name: string | null;
  persona: string | null;
  knowledge: any | null; // json
  image: string | null;
  updated_at: string | null; // timestamp without time zone
  elevenlabs_id: string | null;
  voice_description: string | null;
  elevenlabs_voice_id: string | null;
  creation_status: string | null;
  system_prompt: string | null;
};

let updateQueue: (() => void)[] = [];
let isProcessingQueue = false;
let currentSpeakerId: string | null = null;

function processQueue() {
  if (isProcessingQueue || updateQueue.length === 0) return;
  isProcessingQueue = true;

  const updateFunction = updateQueue.shift();
  if (updateFunction) {
    updateFunction();
  }

  isProcessingQueue = false;

  if (updateQueue.length > 0) {
    setTimeout(processQueue, 0); // Schedule the next queue processing
  }
}

function queueUpdate(updateFunction: () => void) {
  updateQueue.push(updateFunction);
  if (!isProcessingQueue) {
    processQueue();
  }
}

export function ConvAI() {
  const { presentationId } = useParams<{ presentationId: string }>();
  const [presentationData, setPresentationData] = useState<any>(null);

  const [participants, setParticipants] = useState<Agent[]>([]);
  const [sessions, setSessions] = useState<{
    [key: string]: Conversation | null;
  }>({});

  const [time, setTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    console.log(`presentationId:`, presentationId);
    if (presentationId) {
      fetchPresentationData(presentationId);
    }
  }, [presentationId]);

  async function fetchPresentationData(id: string) {
    console.log(`fetchPresentationData:`, id);
    try {
      const response = await fetch(`/api/presentation/${id}`);
      if (!response.ok) {
        console.error(
          `Failed to fetch presentation data: ${response.statusText}`
        );
        throw new Error("Failed to fetch presentation data");
      }
      const agents = (await response.json()) as Agent[];
      console.log(`agents:`, agents);
      console.log(
        `sessions:`,
        agents.reduce((acc, agent) => {
          acc[agent.id] = null;
          return acc;
        }, {} as { [key: string]: Conversation | null })
      );

      setParticipants(agents);
      setSessions(
        agents.reduce((acc, agent) => {
          acc[agent.id] = null;
          return acc;
        }, {} as { [key: string]: Conversation | null })
      );
    } catch (error) {
      console.error("Error fetching presentation data:", error);
    }
  }

  useEffect(() => {
    console.log(`currentSpeakerId: ${currentSpeakerId}`);
    if (currentSpeakerId === null) {
      for (const entry of Object.entries(sessions)) {
        const [id, session] = entry;
        if (session) {
          console.log(`setting volume to 0 for ${id}`);
          session.setVolume({ volume: 0 });
        }
      }
    } else {
      for (const entry of Object.entries(sessions)) {
        const [id, session] = entry;
        if (id === currentSpeakerId) {
          console.log(`setting volume to 0.5 for ${id}`);
          session?.setVolume({ volume: 0.5 });
        } else {
          console.log(`setting volume to 0 for ${id}`);
          session?.setVolume({ volume: 0 });
        }
      }
    }
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
        currentSpeakerId = null;
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

    const updatedSessions = await Promise.all(
      participants.map(async (participant) => {
        const session = await Conversation.startSession({
          agentId: participant.elevenlabs_id ?? "",
          onConnect: () => {
            console.log(`${participant.name} connected`);
          },
          onDisconnect: () => {
            console.log(`${participant.name} disconnected`);
          },
          onError: (error) => {
            console.log(error);
            alert("An error occurred during the conversation");
          },
          onModeChange: ({ mode }) => {
            if (mode === "speaking") {
              if (currentSpeakerId === null) {
                currentSpeakerId = participant.id;
              }
            } else {
              if (currentSpeakerId === participant.id) {
                currentSpeakerId = null;
              }
            }
          },
        });
        if (participant.id === currentSpeakerId) {
          session.setVolume({ volume: 0.5 });
        } else {
          session.setVolume({ volume: 0 });
        }
        return { id: participant.id, session };
      })
    );

    setSessions((prevSessions) => {
      const newSessions = { ...prevSessions };
      updatedSessions.forEach(({ id, session }) => {
        newSessions[id] = session;
      });
      return newSessions;
    });
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
      const session = sessions[participant.id];
      if (session) {
        await session.endSession();
      }
    }
    setSessions((prevSessions) =>
      Object.keys(prevSessions).reduce((acc, key) => {
        acc[Number(key)] = null;
        return acc;
      }, {} as { [key: number]: Conversation | null })
    );
    setParticipants((prevParticipants) =>
      prevParticipants.map((participant) => ({
        ...participant,
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
                participant.id === currentSpeakerId ? "border-blue-500" : ""
              )}
            >
              <CardContent className="p-4">
                <div className="aspect-video bg-muted rounded-lg mb-2"></div>
                <div className="flex items-center gap-2">
                  <Avatar>
                    <AvatarImage
                      src={
                        participant.image ??
                        "/placeholder.svg?height=40&width=40"
                      }
                      alt={participant.name ?? ""}
                    />
                    <AvatarFallback>
                      {participant.name
                        ?.split(" ")
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
