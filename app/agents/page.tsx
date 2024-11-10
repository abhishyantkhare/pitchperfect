"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useRouter, useSearchParams } from "next/navigation";

import { useGlobalContext } from "../context/GlobalContext";

interface Agent {
  id: string;
  name: string;
  persona: string;
  elevenlabs_id: string;
  creation_status:
    | "generating_voice"
    | "setting_up_persona"
    | "ready"
    | "failed";
  created_at: string;
}

export default function AgentsPage() {
  const { intent } = useGlobalContext();
  const router = useRouter();
  const searchParams = useSearchParams();
  const presentationId = searchParams.get("presentationId");

  const [customAgents, setCustomAgents] = useState<Agent[]>([]);
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [showNewAgentForm, setShowNewAgentForm] = useState(false);
  const [newAgent, setNewAgent] = useState({
    name: "",
    persona: "",
    voiceDescription: "",
  });
  const [isLoading, setIsLoading] = useState(false);

  const isVoiceDescriptionValid = newAgent.voiceDescription.length >= 20;
  const voiceDescriptionRemaining = 20 - newAgent.voiceDescription.length;

  useEffect(() => {
    if (!presentationId) {
      router.push("/");
      return;
    }
    fetchAgents();
    const interval = setInterval(fetchAgents, 2000);
    return () => clearInterval(interval);
  }, [presentationId, router]);

  const fetchAgents = async () => {
    try {
      const response = await fetch("/api/agents");
      if (!response.ok) throw new Error("Failed to fetch agents");
      const data = await response.json();
      setCustomAgents(data);
    } catch (error) {
      console.error("Error fetching agents:", error);
    }
  };

  const handleSelectAgent = (agentId: string) => {
    setSelectedAgents((prev) => {
      if (prev.includes(agentId)) {
        return prev.filter((id) => id !== agentId);
      }
      return [...prev, agentId];
    });
  };

  const handleStartPractice = async () => {
    if (selectedAgents.length === 0 || !presentationId) return;

    setIsLoading(true);
    try {
      const response = await fetch("/api/setup-presentation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          presentationId,
          agentIds: selectedAgents,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to setup presentation");
      }

      const data = await response.json();
      if (data.success) {
        // TODO: Navigate to practice session
        router.push(`/present/${presentationId}`);
      }
    } catch (error) {
      console.error("Error setting up practice:", error);
      // You might want to show an error message to the user here
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateAgent = async () => {
    if (!newAgent.name || !newAgent.persona || !isVoiceDescriptionValid) return;

    setIsLoading(true);
    try {
      const response = await fetch("/api/agents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: newAgent.name,
          persona: newAgent.persona,
          voiceDescription: newAgent.voiceDescription,
        }),
      });

      if (!response.ok) throw new Error("Failed to create agent");

      const data = await response.json();
      // Setup voice
      // Trigger voice setup in background
      fetch("/api/agents/setup-voice", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          agentId: data.id,
          name: newAgent.name,
          persona: newAgent.persona,
          voiceDescription: newAgent.voiceDescription,
        }),
      }).catch((error) => {
        console.error("Error triggering voice setup:", error);
      });
      setCustomAgents((prev) => [...prev, data]);
      setNewAgent({ name: "", persona: "", voiceDescription: "" });
      setShowNewAgentForm(false);
    } catch (error) {
      console.error("Error creating agent:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusDisplay = (status: Agent["creation_status"]) => {
    switch (status) {
      case "generating_voice":
        return {
          text: "Generating voice...",
          color: "text-yellow-400",
          icon: (
            <svg
              className="animate-spin -ml-1 mr-3 h-5 w-5 text-yellow-400"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
          ),
        };
      case "setting_up_persona":
        return {
          text: "Setting up persona...",
          color: "text-blue-400",
          icon: (
            <svg
              className="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-400"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
          ),
        };
      case "ready":
        return {
          text: "Ready",
          color: "text-green-400",
          icon: (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5 text-green-400"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
          ),
        };
      case "failed":
        return {
          text: "Creation failed",
          color: "text-red-400",
          icon: (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5 text-red-400"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
          ),
        };
      default:
        return {
          text: "Unknown status",
          color: "text-gray-400",
          icon: null,
        };
    }
  };

  const renderAgentCard = (agent: Agent) => {
    const isSelected = selectedAgents.includes(agent.id);
    const status = getStatusDisplay(agent.creation_status);
    const isSelectable = agent.creation_status === "ready";

    return (
      <Card
        key={agent.id}
        className={`bg-gray-900 border-gray-800 transition-all duration-300 ${
          isSelectable ? "cursor-pointer group" : "opacity-75"
        } ${
          isSelected
            ? "ring-2 ring-blue-500 border-blue-500"
            : isSelectable
            ? "hover:border-gray-700"
            : ""
        }`}
        onClick={() => isSelectable && handleSelectAgent(agent.id)}
      >
        <CardHeader className="space-y-1">
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-lg bg-gray-800 transition-colors
              ${
                isSelected
                  ? "text-blue-400"
                  : "text-gray-400 group-hover:text-blue-400"
              }`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <CardTitle className="text-xl text-white">{agent.name}</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <CardDescription className="text-gray-400 text-base">
            {agent.persona}
          </CardDescription>
          <div className="mt-6 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {status.icon}
              <span className={`text-sm ${status.color}`}>{status.text}</span>
            </div>
            {isSelected && (
              <div className="flex items-center gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-blue-400"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span className="text-sm text-blue-400">Selected</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  const allSelectedAgentsReady = () => {
    return selectedAgents.every((agentId) => {
      const agent = customAgents.find((a) => a.id === agentId);
      return agent?.creation_status === "ready";
    });
  };

  const getStartButtonText = () => {
    if (isLoading) return "Setting up...";
    if (!allSelectedAgentsReady()) {
      return "Waiting for agents to be ready...";
    }
    return `Start Practice with ${selectedAgents.length} ${
      selectedAgents.length === 1 ? "Persona" : "Personas"
    }`;
  };

  return (
    <div className="min-h-screen bg-black w-screen">
      <main className="container mx-auto px-4 py-16">
        <div className="space-y-8">
          <div className="text-center space-y-4">
            <h1 className="text-4xl font-bold text-white">
              Choose Your Audience
            </h1>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              Select one or more personas that will be present in your practice
              session.
            </p>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              Current Intent: {intent}
            </p>
          </div>

          <div className="flex justify-center gap-4">
            <Button
              onClick={() => setShowNewAgentForm(!showNewAgentForm)}
              className="bg-blue-600 hover:bg-blue-700 transition-colors"
            >
              {showNewAgentForm ? "Cancel" : "Create Custom Persona"}
            </Button>
            {selectedAgents.length > 0 && (
              <Button
                onClick={handleStartPractice}
                className={`transition-colors ${
                  allSelectedAgentsReady()
                    ? "bg-green-600 hover:bg-green-700"
                    : "bg-gray-600 cursor-not-allowed"
                }`}
                disabled={isLoading || !allSelectedAgentsReady()}
              >
                {getStartButtonText()}
              </Button>
            )}
          </div>

          {showNewAgentForm && (
            <Card className="bg-gray-900 border-gray-800 max-w-2xl mx-auto">
              <CardHeader>
                <CardTitle className="text-white">Create New Persona</CardTitle>
                <CardDescription>
                  Define a custom audience member for your practice sessions.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm text-gray-400">Name</label>
                  <Input
                    placeholder="e.g., The Devil's Advocate"
                    value={newAgent.name}
                    onChange={(e) =>
                      setNewAgent({ ...newAgent, name: e.target.value })
                    }
                    className="bg-gray-800 border-gray-700 text-white"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-gray-400">
                    Persona Description
                  </label>
                  <Textarea
                    placeholder="Describe the personality and behavior of this audience member..."
                    value={newAgent.persona}
                    onChange={(e) =>
                      setNewAgent({ ...newAgent, persona: e.target.value })
                    }
                    className="bg-gray-800 border-gray-700 text-white min-h-[100px]"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <label className="text-sm text-gray-400">
                      Voice Description
                    </label>
                    {!isVoiceDescriptionValid && (
                      <span className="text-sm text-yellow-500">
                        {voiceDescriptionRemaining} more characters needed
                      </span>
                    )}
                  </div>
                  <Textarea
                    placeholder="e.g., A British man in his 30s with a deep, gravelly voice and a slight London accent. He speaks confidently but not too quickly."
                    value={newAgent.voiceDescription}
                    onChange={(e) =>
                      setNewAgent({
                        ...newAgent,
                        voiceDescription: e.target.value,
                      })
                    }
                    className={`bg-gray-800 border-gray-700 text-white min-h-[50px] ${
                      newAgent.voiceDescription.length > 0 &&
                      !isVoiceDescriptionValid
                        ? "border-yellow-500"
                        : ""
                    }`}
                  />
                  <p className="text-sm text-gray-500">
                    Provide a detailed description of at least 20 characters to
                    help generate a realistic voice.
                  </p>
                </div>
                <Button
                  onClick={handleCreateAgent}
                  className="w-full bg-blue-600 hover:bg-blue-700 transition-colors"
                  disabled={
                    !newAgent.name ||
                    !newAgent.persona ||
                    !isVoiceDescriptionValid ||
                    isLoading
                  }
                >
                  {isLoading ? "Creating..." : "Create Persona"}
                </Button>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6 mt-12">
            {customAgents.map(renderAgentCard)}
          </div>
        </div>
      </main>
    </div>
  );
}
