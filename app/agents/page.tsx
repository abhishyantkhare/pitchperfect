"use client";
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
import { useEffect, useState } from "react";

interface Agent {
  id: string;
  name: string;
  persona: string;
  elevenlabs_id: string;
  created_at: string;
}

export default function AgentsPage() {
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
      // Redirect to home if no presentationId
      router.push("/");
      return;
    }
    fetchAgents();
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
        router.push(`/practice/${presentationId}`);
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
      setCustomAgents((prev) => [...prev, data]);
      setNewAgent({ name: "", persona: "", voiceDescription: "" });
      setShowNewAgentForm(false);
    } catch (error) {
      console.error("Error creating agent:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const renderAgentCard = (agent: any) => {
    const isSelected = selectedAgents.includes(agent.id);

    return (
      <Card
        key={agent.id}
        className={`bg-gray-900 border-gray-800 transition-all duration-300 cursor-pointer group
          ${
            isSelected
              ? "ring-2 ring-blue-500 border-blue-500"
              : "hover:border-gray-700"
          }`}
        onClick={() => handleSelectAgent(agent.id)}
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
              {agent.icon || (
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
              )}
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
              {isSelected && (
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
              )}
              <span
                className={`text-sm ${
                  isSelected ? "text-blue-400" : "text-gray-400"
                }`}
              >
                {isSelected ? "Selected" : "Click to select"}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
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
                className="bg-green-600 hover:bg-green-700 transition-colors"
                disabled={isLoading}
              >
                {isLoading
                  ? "Setting up..."
                  : `Start Practice with ${selectedAgents.length} ${
                      selectedAgents.length === 1 ? "Persona" : "Personas"
                    }`}
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
