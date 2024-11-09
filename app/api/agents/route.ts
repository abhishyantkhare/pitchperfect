import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, persona, voiceDescription } = body;

    if (!name || !persona || !voiceDescription) {
      return NextResponse.json(
        { error: 'Name, persona, and voice description are required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    
    // Insert new agent
    const { data, error } = await supabase
      .from('agents')
      .insert({
        name,
        persona,
        voice_description: voiceDescription,
        knowledge: {},
        creation_status: 'generating_voice',
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating agent:', error);
      return NextResponse.json(
        { error: 'Failed to create agent' },
        { status: 500 }
      );
    }

  

    return NextResponse.json(data);

  } catch (error) {
    console.error('Error in POST /api/agents:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('agents')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching agents:', error);
      return NextResponse.json(
        { error: 'Failed to fetch agents' },
        { status: 500 }
      );
    }

    return NextResponse.json(data);

  } catch (error) {
    console.error('Error in GET /api/agents:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
