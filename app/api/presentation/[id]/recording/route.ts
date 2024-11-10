import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';


import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import os from 'os';
import path from 'path';

import { TranscriptionSegment } from 'openai/resources/audio/transcriptions.mjs';
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
The repsonse should be in a json format like so:
{
  "weak_areas": [
    {
      "id": 0,
      "explanation": "The speaker used the word 'like' too much."
    }
  ]
}
`

async function splitAudioFile(fileData: Blob, weakAreas?: TranscriptionSegment[]) {
  const tempFilePath = path.join(os.tmpdir(), 'temp_recording.mp3');
  const buffer = Buffer.from(await fileData.arrayBuffer());
  fs.writeFileSync(tempFilePath, buffer);

  const clippedFiles = await Promise.all(weakAreas?.map(async (weakArea) => {
    const outputFilePath = path.join(os.tmpdir(), `clip_${weakArea.id}.mp3`);
    await new Promise((resolve, reject) => {
      ffmpeg(tempFilePath)
        .setStartTime(weakArea.start)
        .setDuration(weakArea.end - weakArea.start)
        .output(outputFilePath)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });
    return fs.readFileSync(outputFilePath);
  }) ?? []);

  return clippedFiles;
}



export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = await params;
    const presentationId = id;

    if (!presentationId) {
      return NextResponse.json(
        { error: 'Presentation ID is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    
    // Get the recording file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('pitchperfectfiles')
      .download(`${presentationId}/recording.mp3`);

    if (downloadError) {
      console.error('Error downloading recording:', downloadError);
      return NextResponse.json(
        { error: 'Failed to download recording' },
        { status: 500 }
      );
    }

    if (!fileData) {
      return NextResponse.json(
        { error: 'No recording found' },
        { status: 404 }
      );
    }

    // Convert file data to buffer for sending to Deepgram

    const transcription = await openai.audio.transcriptions.create({
      file: new File([fileData], "recording.mp3", { type: "audio/mpeg" }),
      model: "whisper-1",
      response_format: "verbose_json",
    });

    // Parse the transcription into a list of tuples with the id and text
    const transcriptTuples = transcription.segments?.map((segment: any) => {
      return [segment.id, segment.text];
    });
    // Convert the transcriptTuples to a string
    const transcriptString = transcriptTuples?.map((tuple: any) => `${tuple[0]}, "${tuple[1]}"`).join("\n");

    // Send the transcript to the highlight system prompt
    const highlightResponse = await openai.beta.chat.completions.parse({
      messages: [{ role: "system", content: HIGHLIGHT_SYSTEM_PROMPT }, { role: "user", content: transcriptString || "" }],
      model: "gpt-4o-2024-08-06",
      response_format: zodResponseFormat(HighlightResponse, "highlight_response"),
    });

    const highlightResponseData = highlightResponse.choices[0].message.parsed;
    // Map the ids back to the original transcript and return the segments
    // that are weak areas
    const weakAreas = highlightResponseData?.weak_areas
      .map((weakArea: any) => transcription.segments?.find((segment: any) => segment.id === weakArea.id))
      .filter((segment): segment is TranscriptionSegment => segment !== undefined);
    const clippedFiles = await splitAudioFile(fileData, weakAreas);

    // Upload the weak area clips to storage
    clippedFiles?.map(async (clip, index) => await supabase.storage.from('pitchperfectfiles').upload(`${presentationId}/weak_area_clips/clip_${index}.mp3`, clip));


    console.log(highlightResponseData);

    return NextResponse.json({
      // Include the file data as a base64 string if needed
      // data: Buffer.from(await fileData.arrayBuffer()).toString('base64')
      highlightResponseData
    });

  } catch (error) {
    console.error('Error in POST /api/presentation/[id]/recording:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
