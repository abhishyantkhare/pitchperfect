import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  // Extract the id from the URL path
  const url = new URL(request.url);
  const id = url.pathname.split("/").pop();

  if (!id) {
    return NextResponse.json({ error: "ID is required" }, { status: 400 });
  }

  const supabase = await createClient();

  // Fetch the presentation
  const { data: presentation, error: presentationError } = await supabase
    .from("presentations")
    .select("*")
    .eq("id", id)
    .single();

  if (presentationError) {
    console.error("Error fetching presentation:", presentationError);
    return NextResponse.json(
      { error: "Failed to fetch presentation" },
      { status: 500 }
    );
  }

  if (!presentation) {
    return NextResponse.json(
      { error: "Presentation not found" },
      { status: 404 }
    );
  }
  // Fetch the related presentation_agents
  const { data: presentationAgents, error: agentsError } = await supabase
    .from("presentation_agents")
    .select("*")
    .eq("presentation_id", id);

  if (agentsError) {
    console.error("Error fetching presentation agents:", agentsError);
    return NextResponse.json(
      { error: "Failed to fetch presentation agents" },
      { status: 500 }
    );
  }

  // Fetch the agents associated with the presentation_agents
  const agentIds = presentationAgents.map((agent) => agent.agent_id);
  const { data: agents, error: agentsFetchError } = await supabase
    .from("agents")
    .select("*")
    .in("id", agentIds);

  if (agentsFetchError) {
    console.error("Error fetching agents:", agentsFetchError);
    return NextResponse.json(
      { error: "Failed to fetch agents" },
      { status: 500 }
    );
  }

  return NextResponse.json(agents);
}
