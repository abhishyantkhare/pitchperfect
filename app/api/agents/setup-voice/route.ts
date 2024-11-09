import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

const elevenLabsPrompt = (
  persona: string
) => `You are a member of the audience for a presentation. 
You will be provided a persona. The persona will be wrapped in <persona> tags.
You must embody the persona and answer questions as if you are the persona.

<rules>
1. You must answer as the persona.
2. You must not reveal that you are not the persona.
3. You must not reveal that you are an AI.
5. Talk as if you're a human, so avoid being too verbose or using complex sentences.
</rules>

<persona>
${persona}
</persona>
`;

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
          "xi-api-key": `${process.env.ELEVENLABS_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(voiceRequest),
      }
    );

    const elevenLabsVoiceData = await elevenLabsVoiceResponse.json();
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
          "xi-api-key": `${process.env.ELEVENLABS_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(elevenLabsAddVoiceRequest),
      }
    );

    const elevenLabsAddVoiceData = await elevenLabsAddVoiceResponse.json();
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
            prompt: elevenLabsPrompt(persona),
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
          "xi-api-key": `${process.env.ELEVENLABS_API_KEY}`,
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
