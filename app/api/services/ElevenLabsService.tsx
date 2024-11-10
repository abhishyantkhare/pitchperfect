interface ElevenLabsError extends Error {
  message: string;
  status?: number;
  data?: any;
}

export class ElevenLabsService {
  private static BASE_URL = "https://api.us.elevenlabs.io/v1";
  private static API_KEY = process.env.ELEVENLABS_API_KEY;
  static async createVoicePreview(voiceDescription: string, text: string) {
    try {
      const response = await fetch(
        `${this.BASE_URL}/text-to-voice/create-previews`,
        {
          method: "POST",
          headers: {
            "xi-api-key": `${this.API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ voice_description: voiceDescription, text }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.log(errorData);
        const error: ElevenLabsError = new Error(
          errorData.message || response.statusText
        );
        error.status = response.status;
        error.data = errorData;
        throw error;
      }

      return response.json();
    } catch (error) {
      console.error(
        `ElevenLabsService::createVoicePreview:error: ${error.message}`
      );
      throw error;
    }
  }

  static async createVoiceFromPreview(
    voiceName: string,
    voiceDescription: string,
    generatedVoiceId: string
  ) {
    try {
      const response = await fetch(
        `${this.BASE_URL}/text-to-voice/create-voice-from-preview`,
        {
          method: "POST",
          headers: {
            "xi-api-key": `${this.API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            voice_name: voiceName,
            voice_description: voiceDescription,
            generated_voice_id: generatedVoiceId,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.log(errorData);
        const error: ElevenLabsError = new Error(
          errorData.message || response.statusText
        );
        error.status = response.status;
        error.data = errorData;
        throw error;
      }

      return response.json();
    } catch (error) {
      console.error(
        `ElevenLabsService::createVoiceFromPreview:error: ${error.message}`
      );
      throw error;
    }
  }

  static async createAgent(agentData: object) {
    try {
      const response = await fetch(`${this.BASE_URL}/convai/agents/create`, {
        method: "POST",
        headers: {
          "xi-api-key": `${this.API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(agentData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        const error: ElevenLabsError = new Error(
          errorData.message || response.statusText
        );
        error.status = response.status;
        error.data = errorData;
        throw error;
      }

      return response.json();
    } catch (error) {
      console.error(`ElevenLabsService::createAgent:error: ${error.message}`);
      throw error;
    }
  }

  static async fetchAgent(agentId: string) {
    try {
      const response = await fetch(
        `${this.BASE_URL}/convai/agents/${agentId}`,
        {
          method: "GET",
          headers: {
            "xi-api-key": `${this.API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        const error: ElevenLabsError = new Error(
          errorData.message || response.statusText
        );
        error.status = response.status;
        error.data = errorData;
        throw error;
      }

      return response.json();
    } catch (error) {
      console.error(`ElevenLabsService::fetchAgent:error: ${error.message}`);
      throw error;
    }
  }

  static async updateAgent(agentId: string, agentData: object) {
    try {
      const response = await fetch(
        `${this.BASE_URL}/convai/agents/${agentId}`,
        {
          method: "PATCH",
          headers: {
            "xi-api-key": `${this.API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(agentData),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        const error: ElevenLabsError = new Error(
          errorData.message || response.statusText
        );
        error.status = response.status;
        error.data = errorData;
        throw error;
      }

      return response.json();
    } catch (error) {
      console.error(`ElevenLabsService::updateAgent:error: ${error.message}`);
      throw error;
    }
  }

  static async createKnowledgeBase(agentId: string, name: string, url: string) {
    try {
      const body = {
        agent_id: agentId,
        name,
        url,
      };

      const formData = new FormData();
      formData.append("agent_id", agentId);
      formData.append("name", name);
      formData.append("url", url);

      const response = await fetch(
        `${this.BASE_URL}/convai/agents/${agentId}/add-to-knowledge-base`,
        {
          method: "POST",
          headers: {
            "xi-api-key": `${this.API_KEY}`,
          },
          body: formData,
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        const error: ElevenLabsError = new Error(
          errorData.message || response.statusText
        );
        error.status = response.status;
        error.data = errorData;
        throw error;
      }
      const result: { id: string } = await response.json();
      return result;
    } catch (error) {
      console.error(
        `ElevenLabsService::createKnowledgeBase:error: ${error.message}`
      );
      throw error;
    }
  }

  static async fetchConversationAudio(conversationId: string) {
    const response = await fetch(
      `${this.BASE_URL}/convai/conversations/${conversationId}/audio`,
      {
        headers: {
          "xi-api-key": `${this.API_KEY}`,
        },
      }
    );
    console.log(await response.json());
    return response.blob();
  }
}
