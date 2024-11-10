"use client";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useGlobalContext } from "@/app/context/GlobalContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Conversation } from "@11labs/client";
import { Circle, Video, VideoOff } from "lucide-react";
import Spinner from "./Spinner";

const avatarImages = [
  "/avatar_1.svg",
  "/avatar_2.svg",
  "/avatar_3.svg",
  "/avatar_4.svg",
  "/avatar_5.svg",
  "/avatar_6.svg",
  // Add more paths as needed
];

// Function to get a random avatar image path
const getRandomAvatar = () => {
  const randomIndex = Math.floor(Math.random() * avatarImages.length);
  return avatarImages[randomIndex];
};

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

export type Timestamp = {
  start: number;
  end: number | null;
  conversation_id: string | null;
};

let updateQueue: (() => void)[] = [];
let isProcessingQueue = false;

// Note that if currentSpeakerId is null, the user is speaking
let currentSpeakerId: string | null = null;
let previousSpeakerId: string | null = null;

// The order of agents that have spoken
let agentSpeakingCycle: string[] = [];
const getAgentIdWithMostTurns = () => {
  return agentSpeakingCycle.reduce((prev, curr) => {
    return agentSpeakingCycle.filter((id) => id === curr).length >
      agentSpeakingCycle.filter((id) => id === prev).length
      ? curr
      : prev;
  }, agentSpeakingCycle[0]);
};

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
  const router = useRouter();
  const { intent } = useGlobalContext();
  const { presentationId } = useParams<{ presentationId: string }>();
  const [presentationData, setPresentationData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [participants, setParticipants] = useState<Agent[]>([]);
  const [sessions, setSessions] = useState<{
    [key: string]: Conversation | null;
  }>({});
  const [avatarImages, setAvatarImages] = useState<string[]>([]);

  const [time, setTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);

  const [recordingStatus, setRecordingStatus] = useState<
    "notStarted" | "recording" | "paused" | "finished" | "processing"
  >("notStarted");

  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [isVideoOn, setIsVideoOn] = useState(true);

  const [timestamps, setTimestamps] = useState<Timestamp[]>([]);

  const [audioRecorder, setAudioRecorder] = useState<MediaRecorder | null>(
    null
  );
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);

  useEffect(() => {
    console.log("timestamps: ", timestamps);
  }, [timestamps]);

  const conversationIds: string[] = [];

  const toggleVideo = async () => {
    if (videoRef.current) {
      if (isVideoOn) {
        // Turn off the video
        const stream = videoRef.current.srcObject as MediaStream | null;
        if (stream) {
          console.log("Stopping video tracks");
          stream.getVideoTracks().forEach((track) => track.stop());
          videoRef.current.srcObject = null;
        }
      } else {
        // Turn on the video
        try {
          console.log("Requesting video stream");
          const stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false, // No audio
          });
          console.log("Video stream obtained", stream);
          videoRef.current.srcObject = stream;
        } catch (error) {
          console.error("Error accessing camera:", error);
        }
      }
    } else {
      console.error("Video element reference is null");
    }
    setIsVideoOn((prev) => !prev);
  };

  useEffect(() => {
    console.log(`presentationId:`, presentationId);
    if (presentationId) {
      prepareAgents(presentationId);
      // console.log(`participants:`, participants);
    }
  }, [presentationId]);

  async function prepareAgents(id: string) {
    setLoading(true);
    const agents = await fetchPresentationData(id);
    console.log(`agents:`, agents);
    if (!agents) {
      console.error("could not fetch and prepare agents");
      return;
    }
    await updateAgentsWithIntent(id, intent, agents);
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
    setAvatarImages(agents.map((_) => getRandomAvatar()));
    setLoading(false);
  }

  async function getHighlights() {
    try {
      const audioBlob = new Blob(recordedChunks, { type: "audio/mp3" });
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.mp3");

      const response = await fetch(
        `/api/presentation/${presentationId}/recording`,
        {
          method: "POST",
          // Don't set Content-Type header - browser will set it automatically
          body: formData,
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to get highlights: ${response.statusText}`);
      }

      const data = await response.json();
      console.log("Highlights data:", data);
      return data;
    } catch (error) {
      console.error("Error getting highlights:", error);
    }
  }

  async function updateAgentsWithIntent(
    id: string,
    intent: string,
    agents: Agent[]
  ) {
    console.log(`updateAgentsWithIntent::id:`, id);
    console.log(`updateAgentsWithIntent::intent:`, intent);

    await Promise.all(
      agents.map(async (agent) => {
        try {
          const { id: agentId } = agent;
          const body = {
            intent,
            agentId,
            presentationId: id,
          };
          const response = await fetch(`/api/agents/setup-voice`, {
            method: "PATCH",
            body: JSON.stringify(body),
          });
          if (!response.ok) {
            console.error(
              `Failed to update agents with intent: ${response.statusText}`
            );
            throw new Error("Failed to update agents with intent");
          }
          const result = await response.json();
          console.log(`updateAgentsWithIntent::result:`, result);
        } catch (error) {
          console.error(`updateAgentsWithIntent::error:`, error);
        }
      })
    );
  }

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
      return agents;
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
          // console.log(`setting volume to 0 for ${id}`);
          session.setVolume({ volume: 0 });
        }
      }
    } else {
      for (const entry of Object.entries(sessions)) {
        const [id, session] = entry;
        if (id === currentSpeakerId) {
          // console.log(`setting volume to 0.5 for ${id}`);
          session?.setVolume({ volume: 0.5 });
        } else {
          // console.log(`setting volume to 0 for ${id}`);
          session?.setVolume({ volume: 0 });
        }
      }
    }
  }, [currentSpeakerId]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRunning) {
      interval = setInterval(() => {
        setTime((prevTime) => prevTime + 0.1);
      }, 100); // Update every 100 milliseconds
    }
    return () => clearInterval(interval);
  }, [isRunning]);

  useEffect(() => {
    async function startVideoStream() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false, // No audio
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (error) {
        console.error("Error accessing camera:", error);
      }
    }

    if (!loading) {
      startVideoStream();
    }

    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [loading]);

  useEffect(() => {
    if (currentSpeakerId !== previousSpeakerId) {
      let currId = currentSpeakerId;
      let currTime = time;

      // Add an end timestamp for the previous speaker
      if (timestamps.length === 0) {
        setTimestamps([
          {
            start: 0,
            end: currTime,
            conversation_id: previousSpeakerId
              ? sessions[previousSpeakerId]?.getId() ?? null
              : "user",
          },
        ]);
      } else {
        const prevEnd = timestamps[timestamps.length - 1];
        setTimestamps((prev) => [
          ...prev,
          {
            start: prevEnd.end ?? 0,
            end: currTime,
            conversation_id: previousSpeakerId
              ? sessions[previousSpeakerId]?.getId() ?? null
              : "user",
          },
        ]);
      }
      previousSpeakerId = currId;
    }
  }, [currentSpeakerId]);

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const tenths = Math.floor((seconds * 10) % 10); // Calculate tenths of a second
    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${tenths}`;
  };

  const handleCommand = async (action: string) => {
    switch (action) {
      case "start":
        startAllConversations();
        setIsRunning(true);
        setRecordingStatus("recording");
        startRecording();
        break;
      case "resume":
        setIsRunning(true);
        currentSpeakerId = null;
        setRecordingStatus("recording");
        startRecording();
        break;
      case "pause":
        setIsRunning(false);
        currentSpeakerId = null;
        setRecordingStatus("paused");
        stopRecording();
        break;
      case "finish":
        setIsRunning(false);
        currentSpeakerId = null;
        await endConversation();
        setRecordingStatus("finished");
        await uploadFinalRecording();
        await getHighlights();
        router.push(`/highlights/${presentationId}`);
        break;
      case "process":
        setRecordingStatus("processing");
        break;
    }
  };

  const uploadFinalRecording = async () => {
    try {
      // Create a single blob from all recorded chunks
      const audioBlob = new Blob(recordedChunks, { type: "audio/mp3" });
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.mp3");

      // Upload the complete recording
      const response = await fetch(
        `/api/presentation/${presentationId}/recording`,
        {
          method: "POST",
          body: formData,
        }
      );

      if (!response.ok) {
        throw new Error("Failed to upload recording");
      }

      const data = await response.json();
      console.log("Recording uploaded and analyzed:", data);

      // Clear the recorded chunks after successful upload
      setRecordedChunks([]);
    } catch (error) {
      console.error("Error uploading final recording:", error);
    }
  };

  async function startAllConversations() {
    const hasPermission = await requestMicrophonePermission();
    if (!hasPermission) {
      alert("Microphone permission is required");
      return;
    }

    const updatedSessions = await Promise.all(
      participants.map(async (participant) => {
        console.log(`Starting session for ${participant.name}`);
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
                // Only hold the conch if there are no agents in the cycle or the current agent is not the one with the most turns
                if (
                  agentSpeakingCycle.length === 0 ||
                  getAgentIdWithMostTurns() !== participant.id ||
                  participants.length === 1
                ) {
                  currentSpeakerId = participant.id;
                  agentSpeakingCycle.push(participant.id);
                }
              }
            } else if (mode === "listening") {
              console.log(`${participant.name} stopped speaking`);
              if (currentSpeakerId === participant.id) {
                currentSpeakerId = null;
                startRecording();
              }
            }
          },
        });

        const sessionId = await session.getId();
        conversationIds.push(sessionId);
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

    // Add all the agent ids to the agentSpeakingCycle (fair chance to speak)
    agentSpeakingCycle.push(...updatedSessions.map(({ id }) => id));
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
        console.log(`ending session for ${participant.name}`);
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

  useEffect(() => {
    initializeAudioRecording();
  }, []);

  const initializeAudioRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      });

      // Check supported MIME types
      const mimeTypes = [
        "audio/webm",
        "audio/webm;codecs=opus",
        "audio/ogg;codecs=opus",
      ];

      const supportedType = mimeTypes.find((type) =>
        MediaRecorder.isTypeSupported(type)
      );

      if (!supportedType) {
        throw new Error("No supported audio MIME type found");
      }

      console.log("Using MIME type:", supportedType);

      const recorder = new MediaRecorder(stream, {
        mimeType: supportedType,
        audioBitsPerSecond: 128000,
      });

      recorder.ondataavailable = (event) => {
        console.log("Data available:", event.data.size);
        if (event.data.size > 0) {
          setRecordedChunks((prev) => [...prev, event.data]);
        }
      };

      setAudioRecorder(recorder);
    } catch (error) {
      console.error("Error initializing audio recording:", error);
    }
  };

  const startRecording = () => {
    console.log("Starting recording...");
    if (audioRecorder && audioRecorder.state === "inactive") {
      setRecordedChunks([]);
      try {
        audioRecorder.start(1000); // Record in 1-second chunks
        console.log("Recording started");
      } catch (error) {
        console.error("Error starting recording:", error);
      }
    }
  };

  const stopRecording = async () => {
    console.log("Stopping recording...");
    if (audioRecorder && audioRecorder.state === "recording") {
      try {
        // Register the dataavailable event handler before stopping
        audioRecorder.addEventListener(
          "dataavailable",
          async (event) => {
            console.log("Final chunk size:", event.data.size);
            if (event.data.size > 0) {
              const chunks = [...recordedChunks, event.data];
              console.log("Total chunks:", chunks.length);

              const audioBlob = new Blob(chunks, {
                type: audioRecorder.mimeType,
              });
              console.log("Final blob size:", audioBlob.size);

              const formData = new FormData();
              formData.append(
                "audio",
                audioBlob,
                `recording.${
                  audioRecorder.mimeType.split(";")[0].split("/")[1]
                }`
              );

              try {
                const response = await fetch(
                  `/api/presentation/${presentationId}/recording`,
                  {
                    method: "POST",
                    body: formData,
                  }
                );

                if (!response.ok) {
                  throw new Error("Failed to upload recording");
                }

                const data = await response.json();
                console.log("Recording uploaded successfully:", data);
              } catch (error) {
                console.error("Error uploading recording:", error);
              }
            }
            setRecordedChunks([]);
          },
          { once: true }
        ); // Remove the event listener after it fires once

        audioRecorder.stop();
        console.log("Recording stopped");
      } catch (error) {
        console.error("Error stopping recording:", error);
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col dark">
        <main className="flex flex-grow p-4 overflow-auto h-full items-center justify-center">
          <Spinner />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col dark">
      <main className="flex flex-grow p-4 overflow-auto h-full items-center justify-center">
        <div
          className="flex gap-4 justify-center items-center h-full flex-wrap  flex-grow"
          style={{ height: "100%" }}
        >
          {participants.map((participant, index) => (
            <Card
              key={participant.id}
              className={cn(
                "bg-card text-card-foreground max-w-[80vw] flex-1",
                participant.id === currentSpeakerId ? "border-blue-500" : ""
              )}
            >
              <CardContent className="p-4">
                <div className="aspect-video bg-muted rounded-lg flex justify-center items-center mb-2">
                  <Image
                    src={avatarImages[index]}
                    alt="avatar"
                    width={100}
                    height={100}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Avatar>
                    <AvatarImage
                      src={
                        participant.image ??
                        "/placeholder.svg?height=40&width=40"
                      }
                      alt={participant.name ?? ""}
                      className="w-full h-full object-cover"
                    />
                    <AvatarFallback>
                      {participant.name
                        ?.replace(/\s*\(.*?\)\s*/g, "")
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
            <div className="aspect-video bg-muted rounded-lg w-40 relative">
              <video
                ref={videoRef}
                autoPlay
                muted
                className="w-full h-full object-cover rounded-lg"
              ></video>
              {!isVideoOn && (
                <div className="absolute inset-0 flex items-center justify-center  z-10">
                  <VideoOff className="h-6 w-6 text-muted-foreground" />
                </div>
              )}
            </div>
            <div>
              <h3 className="font-semibold">Your Video</h3>
              <p className="text-sm text-muted-foreground">You</p>
            </div>
            <div className="ml-auto flex gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="icon" variant="outline" onClick={toggleVideo}>
                      {isVideoOn ? (
                        <Video className="h-4 w-4" />
                      ) : (
                        <VideoOff className="h-4 w-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Toggle Video</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </CardContent>
        </Card>
        <Card className="w-full sm:w-auto bg-card text-card-foreground">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="text-2xl font-bold mb-2">{formatTime(time)}</div>
              <div
                className={cn(
                  "flex items-center rounded-full px-2 py-1",
                  recordingStatus === "notStarted" && "bg-gray-500",
                  recordingStatus === "recording" && "bg-red-500 bg-opacity-75",
                  recordingStatus === "paused" && "bg-blue-500",
                  recordingStatus === "finished" && "bg-green-500",
                  recordingStatus === "processing" && "bg-emerald-800"
                )}
              >
                {recordingStatus === "processing" ? (
                  <div className="flex items-center h-4 w-4">
                    <Spinner className=" text-white animate-spin mr-1" />
                  </div>
                ) : (
                  <Circle className="h-3 w-3 text-white animate-pulse mr-1" />
                )}
                <span className="text-white text-xs font-medium">
                  {recordingStatus === "notStarted" && "NOT STARTED"}
                  {recordingStatus === "recording" && "RECORDING"}
                  {recordingStatus === "paused" && "PAUSED"}
                  {recordingStatus === "finished" && "FINISHED"}
                  {recordingStatus === "processing" && "PROCESSING"}
                </span>
              </div>
            </div>

            <div>
              <Button
                onClick={() => handleCommand("start")}
                className="m-1"
                disabled={recordingStatus !== "notStarted"}
              >
                Start
              </Button>
              <Button
                onClick={() => handleCommand("pause")}
                className="m-1"
                disabled={recordingStatus !== "recording"}
              >
                Pause
              </Button>
              <Button
                onClick={() => handleCommand("resume")}
                className="m-1"
                disabled={recordingStatus !== "paused"}
              >
                Resume
              </Button>
              {recordingStatus === "finished" ? (
                <Button
                  onClick={() => handleCommand("process")}
                  className="m-1 bg-emerald-700 text-white hover:text-black hover:bg-emerald-200"
                  disabled={recordingStatus !== "finished"}
                >
                  Process
                </Button>
              ) : (
                <Button
                  onClick={() => handleCommand("finish")}
                  className="m-1 "
                  disabled={
                    recordingStatus !== "recording" &&
                    recordingStatus !== "paused"
                  }
                >
                  Finish
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>{" "}
    </div>
  );
}
