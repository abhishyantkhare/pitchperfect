import { NextResponse } from "next/server";

import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import os from "os";
import path from "path";

import { ElevenLabsService } from "@/app/api/services/ElevenLabsService";
import { Timestamp } from "@/components/ConvAI";
import { createClient } from "@/utils/supabase/server";
import { TranscriptionSegment } from "openai/resources/audio/transcriptions.mjs";
import { z } from "zod";

const openai = new OpenAI();

const WeakArea = z.object({
  start_time: z.number(),
  explanation: z.string(),
  improvement: z.string(),
});

const HighlightResponse = z.object({
  weak_areas: z.array(WeakArea),
});

const HIGHLIGHT_SYSTEM_PROMPT = `
You are the world's best presentation coach.

You will be given a transcript of a presentation and your job is to highlight the areas of the presentation that are not good.

We have agents that I am conversing with and asking me questions. You want to focus on the following:
- Are there areas where I am using filler words? Like "um", "ah", "like", etc.
- Are there areas where I am is not speaking clearly?
- Are there areas where I am did not clearly communicate their point?
- Are there areas where I am did not answer an audience question well?

You will be given the transcript in the format of a list of tuples with the start time (in seconds), speaker, and text, like this:
'''
  <start_time>:<speaker>: "<text>"
'''

For example:
'''
  0:Me: "Today, I want to talk about...",
  56:Agent: "I was curious about...",
  234:Me: "What is that?",
  ...
'''

You will output the list of the areas that are not good along with an explanation for why these sections are not good.
The response should be in a json format like so:
{
  "weak_areas": [
    {
      "start_time": <start_time>,
      "explanation": "<explain why it's a weak area>",
      "improvement": "<suggestion for improvement>"
    },
    ...
  ]
}
`;

async function splitAudioFile(
  fileData: Blob,
  weakAreas?: TranscriptionSegment[]
) {
  const tempFilePath = path.join(os.tmpdir(), "temp_recording.mp3");
  const buffer = Buffer.from(await fileData.arrayBuffer());
  fs.writeFileSync(tempFilePath, buffer);

  const clippedFiles = await Promise.all(
    weakAreas?.map(async (weakArea) => {
      const outputFilePath = path.join(os.tmpdir(), `clip_${weakArea.id}.mp3`);
      await new Promise((resolve, reject) => {
        ffmpeg(tempFilePath)
          .setStartTime(weakArea.start)
          .setDuration(weakArea.end - weakArea.start)
          .output(outputFilePath)
          .on("end", resolve)
          .on("error", reject)
          .run();
      });
      return fs.readFileSync(outputFilePath);
    }) ?? []
  );

  return clippedFiles;
}

async function spliceAudioFiles(
  presentationId: string,
  speakingTimes: Timestamp[],
  audioFiles: string[]
) {

  let outputFilePaths: string[] = [];
  let transcriptStrings: string[] = [];

  // create audio file for first speaking time. we do this because the
  // first speaking time never has a conversation_id because it's the user speaking
  const firstSpeakingTime = speakingTimes[0];
  const firstAudioFile = audioFiles[0];
  const firstOutputFilePath = path.join(os.tmpdir(), `clip_0.mp3`);
  await new Promise((resolve, reject) => {
    ffmpeg(firstAudioFile)
      .setStartTime(0)
      .setDuration(firstSpeakingTime.end)
      .output(firstOutputFilePath)
      .on("end", resolve)
      .on("error", reject)
      .run();
  });
  outputFilePaths.push(firstOutputFilePath);
  const transcriptString = await transcribe(firstOutputFilePath, 0, "Me");

  transcriptStrings.push(transcriptString);

  // create audio files for the rest of the speaking times
  // each audio file contains the agent speaking + user response
  let currConversationId: string | null = null;
  let currStart = firstSpeakingTime.end;
  let currEnd = firstSpeakingTime.end;
  let currSpeaker = "Agent";
  for (let i = 1; i < speakingTimes.length; i++) {
    // 1. Get the speaking time for this segment
    const speakingTime = speakingTimes[i];
    currStart = speakingTime.start;
    currEnd = speakingTime.end;
    currConversationId = speakingTime.conversation_id;
    currSpeaker = "Agent";

    // 2. Get the audio file for this segment
    // 2. Get the audio file for this segment
    let tempFilePath = path.join(os.tmpdir(), `${currConversationId}.mp3`);
    if (speakingTime.conversation_id === "user") {
      // User speaking, so we just use the first audio file
      tempFilePath = audioFiles[0];
      currSpeaker = "Me";
    }

    // 3. Create the output file path
    const outputFilePath = path.join(os.tmpdir(), `clip_${i}.mp3`);

    // 4. Create the audio file for this segment
    await new Promise((resolve, reject) => {
      ffmpeg(tempFilePath)
        .setStartTime(currStart)
        .setDuration(currEnd - currStart)
        .output(outputFilePath)
        .on("end", resolve)
        .on("error", reject)
        .run();
    });

    // 5. Add the output file path to the list
    outputFilePaths.push(outputFilePath);

    // 6. Transcribe the audio file
    const transcriptString = await transcribe(outputFilePath, currStart, currSpeaker);
    // console.log(`\n\n --- transcriptString:`, transcriptString);
    transcriptStrings.push(transcriptString);
  }

  // Concatenate all the output file paths using ffmpeg
  const combinedFilePath = path.resolve(os.tmpdir(), "combined_audio.mp3");
  await new Promise((resolve, reject) => {
    const command = ffmpeg();
    console.log("merge files");
    outputFilePaths.forEach((clipPath) => {
      console.log(`clipPath:`, clipPath);
      command.input(clipPath);
    });
    command.mergeToFile(combinedFilePath, os.tmpdir());
    resolve(null);
  });

  // Upload the combined audio file to Supabase storage
  const supabase = await createClient();
  const { data: existingFiles, error: listError } = await supabase.storage
    .from("pitchperfectfiles")
    .list(`${presentationId}`, { search: 'combined_audio.mp3' });

  if (listError) {
    console.error("Error checking existing files:", listError);
    throw new Error("Failed to check existing files");
  }

  // If the file does not exist, upload it
  if (!existingFiles || existingFiles.length === 0) {
    const { data, error } = await supabase.storage
      .from("pitchperfectfiles")
      .upload(`${presentationId}/combined_audio.mp3`, fs.readFileSync(combinedFilePath), {
        cacheControl: '3600',
        upsert: true
      });

    if (error) {
      console.error("Error uploading file to Supabase:", error);
      throw new Error("Failed to upload file to Supabase");
    }
  }

  // Generate a signed URL for the uploaded file
  const { data: signedUrlData, error: urlError } = await supabase.storage
    .from("pitchperfectfiles")
    .createSignedUrl(`${presentationId}/combined_audio.mp3`, 60 * 60); // URL valid for 1 hour

  if (urlError || !signedUrlData) {
    console.error("Error generating signed URL:", urlError);
    throw new Error("Failed to generate signed URL");
  }

  const signedUrl = signedUrlData.signedUrl;

  console.log("Signed URL:", signedUrl);

  // Return the signed URL in the response
  return {
    transcriptStrings,
    signedUrl,
  };
}

async function transcribe(filePath: string, startTime: number, speaker?: string): Promise<string> {
  // Convert file data
  const transcription = await openai.audio.transcriptions.create({
    file: fs.createReadStream(filePath),
    model: "whisper-1",
    response_format: "verbose_json",
  });

  // Parse the transcription into a list of tuples with the id and text
  const transcriptTuples = transcription.segments?.map((segment: any) => {
    return [(segment.start + startTime).toFixed(1), segment.text];
  }) as [number, string][];

  // Convert the transcriptTuples to a string
  if (speaker) {
    return transcriptTuples?.map((tuple: any) => `${tuple[0]}:${speaker}: "${tuple[1]}"`)
      .join("\n") || "";
  } else {
    return (
        transcriptTuples
        ?.map((tuple: any) => `${tuple[0]}, "${tuple[1]}"`)
        .join("\n") || ""
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = await params;
    const presentationId = id;
    const requestData = await request.json();

    // Ensure we no duplicates conversation ids
    const conversationIds: string[] = [
      ...new Set(requestData.conversationIds as string[]),
    ];

    if (!presentationId) {
      return NextResponse.json(
        { error: "Presentation ID is required" },
        { status: 400 }
      );
    }

    // fetch all audio files from elevenlabs
    const audioFiles = await Promise.all(
      conversationIds.map(async (conversationId: string) => {
        const fileData =
          await ElevenLabsService.fetchConversationAudio(conversationId);
        // console.log(fileData);
        const buffer = Buffer.from(await fileData.arrayBuffer());
        const outputFilePath = path.join(os.tmpdir(), `${conversationId}.mp3`);
        await fs.writeFileSync(outputFilePath, buffer);
        return outputFilePath;
      })
    );

    // splice the audio files
    const {
      transcriptStrings,
      signedUrl,
    } = await spliceAudioFiles(presentationId, requestData.timestamps as Timestamp[], audioFiles);

    // Create a transcription string
    const transcriptString = transcriptStrings.join("\n");
    console.log(`\n\n --- transcriptString:`, transcriptString);
    const segMap = transcriptString.split("\n").map((seg) => {
      const [startTime, speaker, text] = seg.split(":");
      return {
        start_time: parseFloat(startTime),
        quote: `${speaker.trim()}: "${text.trim()}"`,
      };
    });



    // Send the transcript to the highlight system prompt
    const highlightResponse = await openai.beta.chat.completions.parse({
      messages: [
        { role: "system", content: HIGHLIGHT_SYSTEM_PROMPT },
        { role: "user", content: transcriptString || "" },
      ],
      model: "gpt-4o-2024-08-06",
      response_format: zodResponseFormat(
        HighlightResponse,
        "highlight_response"
      ),
    });

    const highlightResponseData = highlightResponse.choices[0].message.parsed;

    if (!highlightResponseData) {
      return NextResponse.json({ error: "No highlight response data" }, { status: 400 });
    }

    // Attach transcript strings to each weak area
    highlightResponseData.weak_areas = highlightResponseData.weak_areas.map((weakArea) => {
      const matchingSegment = segMap.find((segment) => segment.start_time === weakArea.start_time);
      return {
        ...weakArea,
        transcript: matchingSegment ? matchingSegment.quote : "Transcript not found",
      };
    });


    

    // Map the ids back to the original transcript and return the segments
    // that are weak areas
    // const fileData = new Blob(
    //   [fs.readFileSync(path.join(os.tmpdir(), "combined_audio.mp3"))],
    //   { type: "audio/mpeg" }
    // );

    // const weakAreas = highlightResponseData?.weak_areas
    //   .map((weakArea: any) =>
    //     transcription.segments?.find(
    //       (segment: any, index: number) => segment.id === weakArea.id
    //     )
    //   )
    //   .filter(
    //     (segment): segment is TranscriptionSegment => segment !== undefined
    //   );
    // const clippedFiles = await splitAudioFile(fileData, weakAreas);

    // Upload the weak area clips to storage
    // const supabase = await createClient();
    // clippedFiles?.map(
    //   async (clip, index) =>
    //     await supabase.storage
    //       .from("pitchperfectfiles")
    //       .upload(`${presentationId}/weak_area_clips/clip_${index}.mp3`, clip)
    // );

    const numberUmsOrUhs = (transcriptString.match(/ (um|uh)/g) || []).length;
    const numberLikes = (transcriptString.match(/ like/g) || []).length;

    const supabase = await createClient();
    await supabase.from('presentations').update({
      weak_areas: highlightResponseData,
      audio_file: `${presentationId}/combined_audio.mp3`,
      number_ums: numberUmsOrUhs,
      number_likes: numberLikes,
    }).eq('id', presentationId);


    return NextResponse.json({
      // Include the file data as a base64 string if needed
      // data: Buffer.from(await fileData.arrayBuffer()).toString('base64')
      highlightResponseData,
      signedUrl,
    });
  } catch (error) {
    console.error("Error in POST /api/presentation/[id]/recording:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}


export async function GET(request: Request, context: { params: { id: string } }) {
  const { id } = await context.params; // Ensure params is awaited
  console.log(`GET /api/presentation/${id}/recording`);

  const supabase = await createClient();
  const { data, error } = await supabase.from('presentations').select('*').eq('id', id).single();

  if (error || !data) {
    return NextResponse.json({ error: "Presentation not found" }, { status: 404 });
  }

  console.log("data", data);

  // Generate a signed URL for the audio file
  const { data: signedUrlData, error: urlError } = await supabase.storage
    .from("pitchperfectfiles")
    .createSignedUrl(data.audio_file ?? `${id}/combined_audio.mp3`, 60 * 60); // URL valid for 1 hour

  if (urlError || !signedUrlData) {
    console.error("Error generating signed URL:", urlError);
    return NextResponse.json({ error: "Failed to generate signed URL" }, { status: 500 });
  }

  return NextResponse.json({
    ...data,
    signedAudioUrl: signedUrlData.signedUrl,
  });
}
