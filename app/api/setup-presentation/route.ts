import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { presentationId, agentIds } = body;

    if (!presentationId || !agentIds || !Array.isArray(agentIds) || agentIds.length === 0) {
      return NextResponse.json(
        { error: 'Presentation ID and at least one agent ID are required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    // Get all files for this presentation from storage
    // TODO: 
    // Get all the files for the presentation and add to each agent's knowledge base
    // const { data: files, error: storageError } = await supabase.storage
    //   .from('pitchperfectfiles')
    //   .list(presentationId);

    // if (storageError) {
    //   console.error('Error listing files:', storageError);
    //   return NextResponse.json(
    //     { error: 'Failed to list presentation files' },
    //     { status: 500 }
    //   );
    // }

    // // Download each file as binary
    // const filePromises = files.map(async (file) => {
    //   const { data, error } = await supabase.storage
    //     .from('pitchperfectfiles')
    //     .download(`${presentationId}/${file.name}`);

    //   if (error) {
    //     console.error(`Error downloading file ${file.name}:`, error);
    //     return null;
    //   }

    //   return {
    //     name: file.name,
    //     content: data
    //   };
    // });

    // const downloadedFiles = await Promise.all(filePromises);
    // const validFiles = downloadedFiles.filter(file => file !== null);

    // if (validFiles.length === 0) {
    //   return NextResponse.json(
    //     { error: 'No files could be downloaded' },
    //     { status: 500 }
    //   );
    // }
    // // Add to each agent's knowledge base
    // // First pull every agent from supabase
    // const { data: agents, error: agentsError } = await supabase
    //   .from('agents')
    //   .select('id, elevenlabs_id')
    //   .in('id', agentIds);

    // const agentElevenLabsIds = agents?.map((agent) => agent.elevenlabs_id);
    // for (let i = 0; i < (agentElevenLabsIds?.length || 0); i++) {
    //   const elevenLabsId = agentElevenLabsIds?.[i];
    //   for (let j = 0; j < (validFiles.length || 0); j++) {
    //     const file = validFiles[j];
    //     // Add to the knowledge base
    //     const addToKnowledgeBaseRequest = {
    //         agent_id: agents?.[i].id,
    //         name: file.name,
    //         file,
    //     }
    // }

    // }

    

    // Create presentation_agents entries
    const presentationAgents = agentIds.map((agentId) => ({
      presentation_id: presentationId,
      agent_id: agentId,
    }));
    console.log("presentationAgents >>>", presentationAgents);

    const {
      data,
      error: insertError,
      status,
      statusText,
    } = await supabase
      .from("presentations_agents")
      .insert(presentationAgents)
      .select();

    if (insertError) {
      console.error('Error creating presentation agents:', insertError);
      return NextResponse.json(
        { error: 'Failed to set up presentation agents' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      presentationId,
      agentCount: agentIds.length,
    });

  } catch (error) {
    console.error('Error in POST /api/setup-presentation:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
