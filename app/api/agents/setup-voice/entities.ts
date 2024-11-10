export type ElevenLabsAgentResult = {
    agent_id: string;
    name: string;
    conversation_config: {
      agent: {
        prompt: {
          prompt: string;
          llm: string;
          tools: string[];
          knowledge_base: string[];
          temperature: number;
          max_tokens: number;
        };
        first_message: string;
        language: string;
        max_tokens: number;
      };
      asr: {
        quality: string;
        provider: string;
        user_input_audio_format: string;
        keywords: string[];
      };
      turn: {
        turn_timeout: number;
        mode: string;
      };
      tts: {
        model_id: string;
        voice_id: string;
        agent_output_audio_format: string;
        optimize_streaming_latency: number;
        stability: number;
        similarity_boost: number;
      };
      conversation: {
        max_duration_seconds: number;
        client_events: any[]; // Replace 'any' with a more specific type if available
      };
    };
    metadata: {
      created_at_unix_secs: number;
    };
    platform_settings: {
      auth: {
        enable_auth: boolean;
        allowlist: string[];
        shareable_token: string | null;
      };
      evaluation: {
        criteria: any[]; // Replace 'any' with a more specific type if available
      };
      widget: {
        variant: string;
        avatar: object; // Replace 'object' with a more specific type if available
        custom_avatar_path: string | null;
        bg_color: string;
        text_color: string;
        btn_color: string;
        btn_text_color: string;
        border_color: string;
        focus_color: string;
        border_radius: number | null;
        btn_radius: number | null;
        action_text: string | null;
        start_call_text: string | null;
        end_call_text: string | null;
        expand_text: string | null;
        listening_text: string | null;
        speaking_text: string | null;
        shareable_page_text: string | null;
      };
      data_collection: object; // Replace 'object' with a more specific type if available
    };
    secrets: any[]; // Replace 'any' with a more specific type if available
  };