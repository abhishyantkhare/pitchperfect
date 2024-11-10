import { NextResponse } from "next/server";

import { createClient } from "@/utils/supabase/server";
import { ElevenLabsService } from "../../services/ElevenLabsService";
import {
    elevenLabsSystemPrompt,
    elevenLabsSystemPromptWithIntent,
    getPresentationPreSignedUrls,
} from "./utils";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { agentId, name, persona, voiceDescription } = body;

    const supabase = await createClient();

    // Create the voice preview in ElevenLabs
    const text = "Hello! I'm excited to demonstrate my voice capabilities. I can speak clearly and naturally, with proper intonation and emphasis. This sample will help generate a high-quality voice preview.";
    const elevenLabsVoiceData = await ElevenLabsService.createVoicePreview(
      voiceDescription,
      text
    );

    if (
      !elevenLabsVoiceData.previews ||
      elevenLabsVoiceData.previews.length === 0
    ) {
      console.error("No voice previews found", elevenLabsVoiceData);
      return NextResponse.json(
        { error: "No voice previews found" },
        { status: 500 }
      );
    }

    const voiceId = elevenLabsVoiceData.previews[0].generated_voice_id;

    // Add the voice to the ElevenLabs voice library
    const elevenLabsAddVoiceData =
      await ElevenLabsService.createVoiceFromPreview(
        `${name}_voice`,
        voiceDescription,
        voiceId
      );

    const systemPrompt = elevenLabsSystemPrompt(persona);

    // Update the agent in Supabase
    const { error: updateVoiceGenerationStatusError } = await supabase
      .from("agents")
      .update({ creation_status: "setting_up_persona" })
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

    const elevenLabsData = await ElevenLabsService.createAgent(
      elevenLabsRequest
    );

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

// TODO: fetch files from supabase and add them to the knowledge base
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();

    const body = await request.json();

    // make intent == "" to go back to the original system prompt
    const { agentId, presentationId, intent } = body;

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

    const SUPABASE_BUCKET_NAME = "pitchperfectfiles";

    // Get all presigned urls for files uploaded to Supabase for the specific presentationId
    const allKnowledgeSupabasePreSignedUrls =
      await getPresentationPreSignedUrls(
        supabase,
        presentationId,
        SUPABASE_BUCKET_NAME
      );

    // Upload all of those files to the ElevenLabs firebase knowledge base
    let allKnowledgeBaseIds: {
      type: string;
      id: string;
      name: string;
    }[] = [];
    if (allKnowledgeSupabasePreSignedUrls) {
      allKnowledgeBaseIds = await Promise.all(
        allKnowledgeSupabasePreSignedUrls
          .filter(
            (data): data is { fileName: string; signedUrl: string } =>
              data !== undefined
          ) // Filter out undefined values
          .map(async (data: { fileName: string; signedUrl: string }) => {
            const { fileName, signedUrl } = data;
            const result = await ElevenLabsService.createKnowledgeBase(
              elevenLabsAgentId,
              fileName,
              signedUrl
            );
            const firebaseId = result.id;
            return {
              type: "url",
              id: firebaseId,
              name: fileName,
            };
          })
      );
    }

    // Get current agent data and update the agent settings with the new values
    const elevenLabsAgentResult = await ElevenLabsService.fetchAgent(
      elevenLabsAgentId
    );
    const { conversation_config } = elevenLabsAgentResult;

    // Append the intent to the system prompt
    const newSystemPromptWithIntent = elevenLabsSystemPromptWithIntent(
      systemPrompt,
      intent
    );

    const newKnowledgeBase = allKnowledgeBaseIds ?? [];

    const newPrompt = {
      ...conversation_config.agent.prompt,
      prompt: newSystemPromptWithIntent ?? systemPrompt,
      llm: "claude-3-5-sonnet",
      knowledge_base: newKnowledgeBase ?? [],
    };
    console.log(
      "/api/agents/setup-voice/::PATCH:newKnowledgeBase",
      newKnowledgeBase
    );
    const newAgent = {
      ...conversation_config.agent,
      prompt: newPrompt,
    };

    const newAgentBody = {
      ...elevenLabsAgentResult,
      conversation_config: {
        ...conversation_config,
        agent: newAgent,
      },
    };

    // Update the agent in ElevenLabs
    const elevenLabsUpdateAgentResult = await ElevenLabsService.updateAgent(
      elevenLabsAgentId,
      newAgentBody
    );
    console.log("elevenLabsUpdateAgentResult", elevenLabsUpdateAgentResult);

    // Update the agent in Supabase with the voice details
    const { error: updateError } = await supabase
      .from("agents")
      .update({
        knowledge:
          elevenLabsUpdateAgentResult.conversation_config.agent.prompt
            .knowledge_base,
      })
      .eq("id", agentId);

    if (updateError) {
      console.error(
        "/api/agents/setup-voice/::PATCH:error: Error updating agent:",
        updateError
      );
      return NextResponse.json(
        { error: "Failed to update agent with voice details" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("/api/agents/setup-voice/::PATCH:error:", error);

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
