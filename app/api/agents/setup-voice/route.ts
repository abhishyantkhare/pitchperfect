import { NextResponse } from "next/server";

import { createClient } from "@/utils/supabase/server";
import { ElevenLabsAgentResult } from "./entities";
import {
  elevenLabsSystemPrompt,
  elevenLabsSystemPromptWithIntent,
} from "./utils";
import { SupabaseClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { agentId, name, persona, voiceDescription } = body;

    const supabase = await createClient();

    // First create the voice preview in ElevenLabs
    const voiceRequest = {
      voice_description: voiceDescription,
      text: "This is a sample text to generate a voice. I want to ensure this text is long enough to properly capture the voice characteristics and speaking patterns. Please use this audio sample to create a natural sounding voice that matches the description provided.",
    };

    const elevenLabsVoiceResponse = await fetch(
      "https://api.elevenlabs.io/v1/text-to-voice/create-previews",
      {
        method: "POST",
        headers: {
          "xi-api-key": `${process.env.XI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(voiceRequest),
      }
    );

    const elevenLabsVoiceData = await elevenLabsVoiceResponse.json();

    if (
      !elevenLabsVoiceData.previews ||
      elevenLabsVoiceData.previews.length === 0
    ) {
      console.error(
        "/api/agents/setup-voice/::POST:error: No voice previews found, check your environment variables",
        elevenLabsVoiceData
      );
      return NextResponse.json(
        { error: "No voice previews found" },
        { status: 500 }
      );
    }

    const voiceId = elevenLabsVoiceData.previews[0].generated_voice_id;

    // Add the voice to the ElevenLabs voice library
    const elevenLabsAddVoiceRequest = {
      voice_name: `${name}_voice`,
      voice_description: voiceDescription,
      generated_voice_id: voiceId,
    };

    const elevenLabsAddVoiceResponse = await fetch(
      "https://api.elevenlabs.io/v1/text-to-voice/create-voice-from-preview",
      {
        method: "POST",
        headers: {
          "xi-api-key": `${process.env.XI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(elevenLabsAddVoiceRequest),
      }
    );

    const elevenLabsAddVoiceData = await elevenLabsAddVoiceResponse.json();
    const systemPrompt = elevenLabsSystemPrompt(persona);

    const { error: updateVoiceGenerationStatusError } = await supabase
      .from("agents")
      .update({
        creation_status: "setting_up_persona",
      })
      .eq("id", agentId);

    // Create the agent in ElevenLabs
    const elevenLabsRequest = {
      name: name,
      conversation_config: {
        agent: {
          language: "en",
          prompt: {
            prompt: systemPrompt,
            llm: "claude-3-5-sonnet",
            tools: [],
            knowledge_base: [],
            temperature: 0.5,
            max_tokens: -1,
          },
        },
        asr: {
          quality: "high",
          provider: "elevenlabs",
          user_input_audio_format: "pcm_16000",
          keywords: [],
        },
        tts: {
          voice_id: elevenLabsAddVoiceData.voice_id,
          model_id: "eleven_turbo_v2",
          agent_output_audio_format: "pcm_16000",
          optimize_streaming_latency: 3,
          stability: 0.5,
          similarity_boost: 0.8,
        },
        turn: {
          turn_timeout: 7,
        },
        conversation: {
          max_duration_seconds: 300,
          client_events: [
            "audio",
            "interruption",
            "user_transcript",
            "agent_response",
            "agent_response_correction",
            "internal_vad_score",
            "internal_turn_probability",
            "internal_tentative_agent_response",
          ],
        },
      },
      platform_settings: {
        widget: {
          variant: "full",
          avatar: {
            type: "orb",
            color_1: "#6DB035",
            color_2: "#F5CABB",
          },
        },
        evaluation: {},
        auth: {
          allowlist: [],
        },
        data_collection: {},
      },
      knowledge_base: [],
      secrets: [],
    };

    const elevenLabsResponse = await fetch(
      "https://api.elevenlabs.io/v1/convai/agents/create",
      {
        method: "POST",
        headers: {
          "xi-api-key": `${process.env.XI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(elevenLabsRequest),
      }
    );

    const elevenLabsData = await elevenLabsResponse.json();
    console.log(elevenLabsData);

    // Update the agent in Supabase with the voice details
    const { error: updateError } = await supabase
      .from("agents")
      .update({
        elevenlabs_id: elevenLabsData.agent_id,
        elevenlabs_voice_id: voiceId,
        creation_status: "ready",
        system_prompt: systemPrompt,
      })
      .eq("id", agentId);

    if (updateError) {
      console.error("Error updating agent:", updateError);
      return NextResponse.json(
        { error: "Failed to update agent with voice details" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in POST /api/agents/setup-voice:", error);

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

async function getPresentationPreSignedUrls(
  supabase: SupabaseClient,
  presentationId: string,
  bucketName: string
) {
  const expiryTime = 3600; // Expiry time in seconds (1 hour)

  const bucketFolderPath = presentationId;
  // List files in the specified bucket
  const { data: files, error: listError } = await supabase.storage
    .from(bucketName)
    .list(bucketFolderPath);
  if (listError) {
    console.error("Error listing files:", listError);
    return;
  }
  console.log(
    "getPresentationPreSignedUrls::supabaseObjectStore:files",
    files.map((file) => file.name)
  );
  // Generate pre-signed URLs for each file
  const preSignedUrls = await Promise.all(
    files.map(async (file) => {
      const bucketFilePath = `${bucketFolderPath}/${file.name}`;
      const { data: signedUrlData, error: urlError } = await supabase.storage
        .from(bucketName)
        .createSignedUrl(bucketFilePath, expiryTime);

      if (urlError) {
        console.error(`Error creating signed URL for ${file.name}:`, urlError);
        return null;
      }

      return { fileName: file.name, signedUrl: signedUrlData.signedUrl };
    })
  );

  // Filter out any null results due to errors
  const signedUrls = preSignedUrls.map((url) => url?.signedUrl);
  const cleanSignedUrls = signedUrls.filter((url) => url !== null);
  return cleanSignedUrls;
}

// TODO: fetch files from supabase and add them to the knowledge base
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();

    const body = await request.json();

    // make intent == "" to go back to the original system prompt
    const { agentId, presentationId, intent } = body;

    const SUPABASE_BUCKET_NAME = "pitchperfectfiles";
    // Example usage
    const allKnowledgeSupabasePreSignedUrls =
      await getPresentationPreSignedUrls(
        supabase,
        presentationId,
        SUPABASE_BUCKET_NAME
      );

    const agent = await supabase
      .from("agents")
      .select("elevenlabs_id, system_prompt")
      .eq("id", agentId)
      .single();
    if (agent.error) {
      console.error(
        "/api/agents/setup-voice/::PATCH:error: error fetching agent:",
        agent.error
      );
      return NextResponse.json(
        { error: "Failed to fetch agent" },
        { status: 500 }
      );
    }

    const { elevenlabs_id: elevenLabsAgentId, system_prompt: systemPrompt } =
      agent.data;

    // Get current agent data and update the agent settings with the new values
    const elevenLabsUrl = "https://api.us.elevenlabs.io/v1/convai/agents";
    const elevenLabsFetchAgentResponse = await fetch(
      `${elevenLabsUrl}/${elevenLabsAgentId}`,
      {
        method: "GET",
        headers: {
          "xi-api-key": `${process.env.XI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const elevenLabsAgentResult: ElevenLabsAgentResult =
      await elevenLabsFetchAgentResponse.json();
    const { conversation_config } = elevenLabsAgentResult;

    const newSystemPromptWithIntent = elevenLabsSystemPromptWithIntent(
      systemPrompt,
      intent
    );

    const newPrompt = {
      ...conversation_config.agent.prompt,
      prompt: newSystemPromptWithIntent ?? systemPrompt,
      llm: "claude-3-5-sonnet",
    };

    const newKnowledgeBase = allKnowledgeSupabasePreSignedUrls ?? [];
    console.log("newKnowledgeBase", newKnowledgeBase);
    const newAgent = {
      ...conversation_config.agent,
      prompt: newPrompt,
      knowledge_base: newKnowledgeBase,
    };

    const newAgentBody = {
      ...elevenLabsAgentResult,
      conversation_config: {
        ...conversation_config,
        agent: newAgent
      },
    };

    // console.log("newConversationConfig", newConversationConfig);
    // console.log("elevenLabsAgentResult", elevenLabsAgentResult);
    // console.log(
    //   "elevenLabsAgentResult prompt",
    //   elevenLabsAgentResult.conversation_config.agent.prompt
    // );
    // console.log("newConversationConfig prompt", newConversationConfig);
    // console.log("newAgentBody", newAgentBody.conversation_config.agent.prompt);

    // Update the agent in ElevenLabs
    const elevenLabsUpdateAgentResponse = await fetch(
      `${elevenLabsUrl}/${elevenLabsAgentId}`,
      {
        method: "PATCH",
        headers: {
          "xi-api-key": `${process.env.XI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newAgentBody),
      }
    );

    const elevenLabsUpdateAgentResult =
      await elevenLabsUpdateAgentResponse.json();
    console.log("elevenLabsUpdateAgentResult", elevenLabsUpdateAgentResult);

    // Update the agent in Supabase with the voice details
    const { error: updateError } = await supabase
      .from("agents")
      .update({
        persona:
          elevenLabsUpdateAgentResult.conversation_config.agent.prompt.prompt,
        knowledge:
          elevenLabsUpdateAgentResult.conversation_config.agent.prompt
            .knowledge_base,
      })
      .eq("id", agentId);

    if (updateError) {
      console.error("Error updating agent:", updateError);
      return NextResponse.json(
        { error: "Failed to update agent with voice details" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in PATCH /api/agents/setup-voice:", error);

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
