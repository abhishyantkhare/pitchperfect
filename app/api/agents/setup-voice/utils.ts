import { SupabaseClient } from "@supabase/supabase-js";

export const elevenLabsSystemPrompt = (
    persona: string
  ) => `You are a member of the audience for a presentation. 
  You will be provided a persona. The persona will be wrapped in <persona> tags.
  You must embody the persona and answer questions as if you are the persona.
  You will be provided a intent. The intent will be wrapped in <intent> tags.
  You must use the intent to guide your answers.
  
  <rules>
  1. You must answer as the persona.
  2. You must not reveal that you are not the persona.
  3. You must not reveal that you are an AI.
  4. You must refer to the knowledge base provided to you to answer the questions.
  5. Talk as if you're a human, so avoid being too verbose or using complex sentences.
  </rules>
  
  <persona>
  ${persona}
  </persona>
  `;
  
  export const elevenLabsSystemPromptWithIntent = (
    systemPrompt: string,
    intent: string
  ) => `${systemPrompt}<intent>${intent}</intent>`;
  

  // Supabase Utils
  export async function getPresentationPreSignedUrls(
    supabase: SupabaseClient,
    presentationId: string,
    bucketName: string
  ) {
    const fileNamesToIgnore = ["recording.mp3", "recording.wav"];

    const expiryTime = 3600; // Expiry time in seconds (1 hour)
  
    const bucketFolderPath = presentationId;
    // List files in the specified bucket
    const { data: files, error: listError } = await supabase.storage
      .from(bucketName)
      .list(bucketFolderPath);
    if (listError) {
      console.error("Error listing files:", listError);
      return;
    }
    const filteredFiles = files.filter((file) => !fileNamesToIgnore.includes(file.name));
    console.log(
      "getPresentationPreSignedUrls::supabaseObjectStore:files",
      filteredFiles
    );

    // Generate pre-signed URLs for each file
    const preSignedUrls = await Promise.all(
      filteredFiles.map(async (file) => {
        const bucketFilePath = `${bucketFolderPath}/${file.name}`;
        const { data: signedUrlData, error: urlError } = await supabase.storage
          .from(bucketName)
          .createSignedUrl(bucketFilePath, expiryTime);
  
        if (urlError) {
          console.error(`Error creating signed URL for ${file.name}:`, urlError);
          return null;
        }
  
        return { fileName: file.name, signedUrl: signedUrlData.signedUrl };
      })
    );
  
    // Filter out any null results due to errors
    const signedUrls = preSignedUrls.map((url) => url?.signedUrl);
    const cleanSignedUrls = signedUrls.filter((url) => url !== null);
    return cleanSignedUrls;
  }
  