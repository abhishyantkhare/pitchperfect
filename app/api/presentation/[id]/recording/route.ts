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

async function spliceAudioFiles(speakingTimes: any[], audioFiles: string[]) {
  let currStart = 0;
  // create audio file for first speaking time. we do this because the
  // first speaking time never has a conversation_id because it's the user speaking
  const firstSpeakingTime = speakingTimes[0];
  const firstAudioFile = audioFiles[0];
  const firstOutputFilePath = path.join(os.tmpdir(), `clip_0.mp3`);
  await new Promise((resolve, reject) => {
    ffmpeg(firstAudioFile)
      .setStartTime(currStart)
      .setDuration(firstSpeakingTime.end - currStart)
      .output(firstOutputFilePath)
      .on("end", resolve)
      .on("error", reject)
      .run();
  });

  // create audio files for the rest of the speaking times
  // each audio file contains the agent speaking + user response
  let currConversationId: string | null = null;
  for (let i = 1; i < speakingTimes.length; i++) {
    const speakingTime = speakingTimes[i];
    if (speakingTime.conversation_id) {
      // this the agent speaking, so we capture the start time
      currStart = speakingTime.start;
      currConversationId = speakingTime.conversation_id;
      if (i !== speakingTimes.length - 1) {
        continue;
      }
    }
    if (i === speakingTimes.length - 1 || !speakingTime.conversation_id) {
      {
        // this is the user speaking, so we capture the end time
        // but save it with the conversation_id of the previous agent
        const tempFilePath = path.join(
          os.tmpdir(),
          `${currConversationId}.mp3`
        );
        const outputFilePath = path.join(os.tmpdir(), `clip_${i}.mp3`);
        await new Promise((resolve, reject) => {
          ffmpeg(tempFilePath)
            .setStartTime(currStart)
            .setDuration(speakingTime.end - currStart)
            .output(outputFilePath)
            .on("end", resolve)
            .on("error", reject)
            .run();
        });
      }
    }
  }

  // Concatenate all the files using ffmpeg
  // Create a command to combine all audio clips

  await new Promise((resolve, reject) => {
    // Add each audio clip to the ffmpeg command
    const command = ffmpeg();
    console.log("merge files");
    speakingTimes.forEach((speakingTime, i) => {
      const clipPath = path.resolve(os.tmpdir(), `clip_${i}.mp3`);
      console.log(`clipPath:`, clipPath);
      command.input(clipPath);
    });
    command.mergeToFile(
      path.resolve(os.tmpdir(), "combined_audio.mp3"),
      os.tmpdir()
    );
    resolve(null);
  });
  await new Promise((resolve) => setTimeout(resolve, 5000));
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = await params;
    const presentationId = id;
    const requestData = await request.json();
    const conversationIdDups: string[] = requestData.timestamps
      .filter((timeStamp: Timestamp) => timeStamp.conversation_id)
      .map((timeStamp: Timestamp) => timeStamp.conversation_id);

    // Remove duplicates
    const conversationIds: string[] = [...new Set(conversationIdDups)];

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
        console.log(fileData);
        const buffer = Buffer.from(await fileData.arrayBuffer());
        const outputFilePath = path.join(os.tmpdir(), `${conversationId}.mp3`);
        await fs.writeFileSync(outputFilePath, buffer);
        return outputFilePath;
      })
    );

    // splice the audio files
    await spliceAudioFiles(requestData.timestamps, audioFiles);

    // Convert file data

    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(path.join(os.tmpdir(), "combined_audio.mp3")),
      model: "whisper-1",
      response_format: "verbose_json",
    });
    console.log(`transcription:`, transcription);

    // Parse the transcription into a list of tuples with the id and text
    const transcriptTuples = transcription.segments?.map((segment: any) => {
      return [segment.id, segment.text];
    });
    // Convert the transcriptTuples to a string
    const transcriptString = transcriptTuples
      ?.map((tuple: any) => `${tuple[0]}, "${tuple[1]}"`)
      .join("\n");

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
    // Map the ids back to the original transcript and return the segments
    // that are weak areas
    const fileData = new Blob(
      [fs.readFileSync(path.join(os.tmpdir(), "combined_audio.mp3"))],
      { type: "audio/mpeg" }
    );

    const weakAreas = highlightResponseData?.weak_areas
      .map((weakArea: any) =>
        transcription.segments?.find(
          (segment: any, index: number) => segment.id === weakArea.id
        )
      )
      .filter(
        (segment): segment is TranscriptionSegment => segment !== undefined
      );
    const clippedFiles = await splitAudioFile(fileData, weakAreas);

    // Upload the weak area clips to storage
    const supabase = await createClient();
    clippedFiles?.map(
      async (clip, index) =>
        await supabase.storage
          .from("pitchperfectfiles")
          .upload(`${presentationId}/weak_area_clips/clip_${index}.mp3`, clip)
    );

    console.log(highlightResponseData);

    return NextResponse.json({
      // Include the file data as a base64 string if needed
      // data: Buffer.from(await fileData.arrayBuffer()).toString('base64')
      highlightResponseData,
    });
  } catch (error) {
    console.error("Error in POST /api/presentation/[id]/recording:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
