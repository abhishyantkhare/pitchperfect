import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    const topic = formData.get('topic') as string;
    
    if (!topic) {
      return NextResponse.json({ error: 'Topic is required' }, { status: 400 });
    }

    const supabase = await createClient();

    // Insert a new row with the topic
    const { data, error } = await supabase
      .from('presentations')
      .insert({
        topic
      })
      .select()
      .single();
    
    if (error) {
      console.error('Error creating presentation:', error);
      return NextResponse.json({ error: 'Failed to create presentation' }, { status: 500 });
    }

    // Handle file uploads
    for (const file of files) {
      const fileName = `${data.id}/${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('pitchperfectfiles')
        .upload(fileName, file);

      if (uploadError) {
        console.error('Error uploading file:', uploadError);
        // Continue with other files even if one fails
      }
    }

    return NextResponse.json({ id: data.id });

  } catch (error) {
    console.error('Error in POST /api/presentation:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
