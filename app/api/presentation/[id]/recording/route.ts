import { createClient } from '@/utils/supabase/server';
import ffmpeg from 'fluent-ffmpeg';
import { writeFile } from 'fs/promises';
import { NextResponse } from 'next/server';
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { TranscriptionSegment } from "openai/resources/audio/transcriptions.mjs";
import path from 'path';
import { z } from "zod";

const openai = new OpenAI();

const WeakArea = z.object({
  id: z.number(),
  explanation: z.string(),
});

const HighlightResponse = z.object({
  weak_areas: z.array(WeakArea),
});

const HIGHLIGHT_SYSTEM_PROMPT = `
You are the world's best speech coach. You will be given a transcript of a speech and your job is to highlight the areas of the speech that are not good.
You want to focus on the following:
- Are there areas where the speaker is using filler words? Like "um", "ah", "like", etc.
- Are there areas where the speaker is not speaking clearly?
- Are there areas where the speaker did not clearly communicate their point?
- Are there areas where the speaker did not answer an audience question well?

You will be given the transcript in the format of a list of tuples with the id and text, like this:
[
  (0, "Hello, my name is John."),
  (1, "Today, I want to talk about..."),
  ...
]

You will output the list of ids of the areas that are not good along with a short explanation for why they are not good.
The response should be in a json format like so:
{
  "weak_areas": [
    {
      "id": 0,
      "explanation": "The speaker used the word 'like' too much."
    }
  ]
}
`;

async function createHighlightClips(
  audioFilePath: string,
  weakAreas: TranscriptionSegment[],
  presentationId: string
) {
  try {
    // Create clips for each weak area
    const clips = await Promise.all(
      weakAreas.map(async (segment, index) => {
        const startTime = segment.start;
        const duration = segment.end - segment.start;
        const outputFileName = `clip_${index}.mp3`;
        const outputPath = path.join('/tmp', outputFileName);

        // Create a promise-based wrapper for ffmpeg
        await new Promise((resolve, reject) => {
          ffmpeg(audioFilePath)
            .setStartTime(startTime)
            .setDuration(duration)
            .output(outputPath)
            .on('end', resolve)
            .on('error', reject)
            .run();
        });

        // Read the generated clip
        const clipData = await require('fs').promises.readFile(outputPath);
      

        return {
          data: clipData,
          fileName: outputFileName,
          segment
        };
      })
    );

    // Upload clips to Supabase
    const supabase = await createClient();
    await Promise.all(
      clips.map(async (clip) => {
        const { error: uploadError } = await supabase.storage
          .from('pitchperfectfiles')
          .upload(
            `${presentationId}/weak_areas/${clip.fileName}`,
            clip.data,
            {
              contentType: 'audio/mp3'
            }
          );

        if (uploadError) {
          console.error(`Error uploading highlight clip ${clip.fileName}:`, uploadError);
        }
      })
    );


  } catch (error) {
    console.error('Error creating highlight clips:', error);
    throw error;
  }
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File;

    const { id } = await params;
    
    if (!audioFile) {
      return NextResponse.json(
        { error: 'Audio file is required' },
        { status: 400 }
      );
    }

    // Convert the audio file to a buffer
    const audioBuffer = Buffer.from(await audioFile.arrayBuffer());

    // Save the audio file temporarily
    const tempInputPath = path.join('/tmp', `input-${Date.now()}.mp3`);
    await writeFile(tempInputPath, audioBuffer);

    // Transcribe the audio using OpenAI
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-1",
      response_format: "verbose_json",
      language: "en",
    });

    // Process transcription and get weak areas
    const transcriptTuples = transcription.segments?.map((segment: any) => {
      return [segment.id, segment.text];
    });

    const transcriptString = transcriptTuples
      ?.map((tuple: any) => `${tuple[0]}, "${tuple[1]}"`)
      .join('\n');

    const highlightResponse = await openai.beta.chat.completions.parse({
      messages: [
        { role: 'system', content: HIGHLIGHT_SYSTEM_PROMPT },
        { role: 'user', content: transcriptString || '' },
      ],
      model: 'gpt-4o',
      response_format: zodResponseFormat(HighlightResponse, 'highlight_response'),
    });

    const highlightResponseData = highlightResponse.choices[0].message.parsed;

    const weakAreaSegments = highlightResponseData?.weak_areas.map((weakArea: any) => transcription.segments?.find((segment: any) => segment.id === weakArea.id));
    console.log(weakAreaSegments);

    await createHighlightClips(tempInputPath, weakAreaSegments, id);

    
    const supabase = await createClient();

    await supabase.from('presentations').update({
      weak_areas: highlightResponseData?.weak_areas
    }).eq('id', id);


    return NextResponse.json({
      transcription,
      weak_areas: highlightResponseData?.weak_areas,
    });

  } catch (error) {
    console.error('Error in POST /api/presentation/[id]/recording:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
