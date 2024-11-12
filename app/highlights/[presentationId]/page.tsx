"use client";

import Spinner from "@/components/Spinner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { supabaseClient as supabase } from "@/utils/supabase/client";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

const SUPABASE_BUCKET_NAME = "pitchperfectfiles";

// Define a type for the presentation data
type PresentationData = {
  presentationTitle: string;
  weak_areas: {
    id: string;
    explanation: string;
  }[];
};

// This is a mock function to simulate fetching data from the server
const fetchPresentationData = async (presentationId: string) => {
  console.log("fetching presentation data for presentationId:", presentationId);
  try {
    // const response = await fetch(
    //   `/api/presentation/${presentationId}/recording`,
    //   {
    //     method: 'POST',
    //     headers: {
    //       'Content-Type': 'application/json',
    //     },
    //     body: JSON.stringify({
    //       /* Add any necessary request body data here */
    //     }),
    //   }
    // );

    // if (!response.ok) {
    //   throw new Error('Failed to fetch presentation data');
    // }

    // const data = await response.json();
    // return {
    //   presentationTitle: 'Effective Public Speaking Techniques', // Assuming the title is static or fetched elsewhere
    //   weak_areas: data.highlightResponseData.weak_areas.map((area: any) => ({
    //     id: `clip${area.id}`,
    //     explanation: area.explanation,
    //   })),
    // };
    return {
      presentationTitle: "Effective Public Speaking Techniques", // Assuming the title is static or fetched elsewhere
      weak_areas: [],
    };
  } catch (error) {
    console.error("Error fetching presentation data:", error);
    return null;
  }
};

// Function to generate feedback based on index
const getFeedbackForIndex = (
  feedbackOptions: [],
  presentationId: string,
  index: number
) => {
  // const feedbackOptions = [
  //   "Great job on maintaining eye contact with the audience!",
  //   "Consider using more visuals to support your points.",
  //   "Your pacing was excellent, but try to vary your tone for emphasis.",
  //   "The introduction was strong, but the conclusion could be more impactful.",
  //   "Try to engage the audience with questions or interactive elements.",
  //   "Your content was well-organized, but ensure to highlight key takeaways.",
  //   "Consider reducing filler words to make your speech more concise.",
  //   "Your enthusiasm was contagious, keep it up!",
  //   "The examples you used were relevant and helped clarify your points.",
  //   "Try to incorporate more storytelling to make your presentation memorable.",
  // ];

  for (const area of feedbackOptions || []) {
    console.log("area", area);
    if (index === area?.id) {
      return area?.explanation;
    }
    console.log(area);
  }
  console.log("presentationId", presentationId);
};

export default function Component() {
  const { presentationId } = useParams();

  // Use the defined type for the state
  const [presentationData, setPresentationData] =
    useState<PresentationData | null>(null);
  const [audioUrls, setAudioUrls] = useState<string[]>([]);
  const [feedbackOptions, setFeedbackOptions] = useState<[]>([]);

  useEffect(() => {
    if (!presentationId) return; // Ensure presentationId is available

    const loadData = async () => {
      const data = await fetchPresentationData(presentationId as string);
      setPresentationData(data);
      if (!data) return;

      const hardCoded = presentationId;
      const { data: files, error } = await supabase.storage
        .from(SUPABASE_BUCKET_NAME)
        .list(`${hardCoded}/weak_areas/`);

      const presentationData = await supabase
        .from("presentations")
        .select("weak_areas")
        .eq("id", presentationId);

      setFeedbackOptions(presentationData?.data?.[0].weak_areas || []);

      console.log("presentationData", presentationData);

      console.log("files", files);
      if (error) {
        console.error("Error listing files:", error);
        return;
      }

      const urls = await Promise.all(
        files.map(async (file) => {
          const { data: signedUrlData, error: signedUrlError } =
            await supabase.storage
              .from(SUPABASE_BUCKET_NAME)
              .createSignedUrl(`${hardCoded}/weak_areas/${file.name}`, 600); // 600 seconds expiration

          if (signedUrlError) {
            console.error("Error creating signed URL:", signedUrlError);
            return "";
          }

          return signedUrlData.signedUrl;
        })
      );

      console.log("urls", urls);

      setAudioUrls(urls);
    };

    loadData();
  }, [presentationId]); // Add presentationId as a dependency

  const [isPageLoading, setIsPageLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsPageLoading(false);
    }, 6000);

    return () => clearTimeout(timer);
  }, []);
  if (isPageLoading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col dark">
        <main className="flex flex-grow p-4 overflow-auto h-full flex-col items-center justify-center">
          <Spinner />
          <p className="text-white">Compiling highlights...</p>
        </main>
      </div>
    );
  }

  if (!presentationData) {
    return (
      <div className="flex justify-center items-center h-screen bg-black text-white min-h-screen w-full">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-4 md:p-8 w-full">
      <Card className="bg-black border-gray-800">
        <CardHeader>
          <CardTitle className="text-2xl md:text-3xl text-left text-white">
            {presentationData.presentationTitle}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[calc(100vh-200px)]">
            <div className="space-y-6">
              {presentationData.weak_areas.map((clip, index) => (
                <div key={clip.id} className="border border-gray-800">
                  {index > 0 && <Separator className="my-6 bg-gray-800" />}
                  <div className="space-y-4">
                    <h2 className="text-lg md:text-xl text-gray-200">
                      Highlight Clip {index + 1}
                    </h2>
                    <div className="aspect-video bg-gray-900 flex items-center justify-center">
                      {audioUrls[index] ? (
                        <audio controls>
                          <source src={audioUrls[index]} type="audio/mp3" />
                          Your browser does not support the audio element.
                        </audio>
                      ) : (
                        <span className="text-gray-400">Loading audio...</span>
                      )}
                    </div>
                    <p className="text-sm md:text-base text-gray-300">
                      {getFeedbackForIndex(
                        feedbackOptions,
                        presentationId,
                        index
                      )}
                    </p>
                  </div>
                </div>
              ))}
              {audioUrls.map((url, index) => (
                <div key={url} className="">
                  {<Separator className="my-6 bg-gray-800" />}
                  <div className="space-y-2">
                    <h2 className="text-lg md:text-xl text-gray-200 p-2 font-bold ">
                      Highlight Clip {index + 1}
                    </h2>
                    <div className=" bg-transparent flex items-start justify-start">
                      {url ? (
                        <audio controls>
                          <source src={url} type="audio/mp3" />
                          Your browser does not support the audio element.
                        </audio>
                      ) : (
                        <span className="text-gray-400">Loading audio...</span>
                      )}
                    </div>
                    <p className="text-sm md:text-base text-gray-300">
                      {getFeedbackForIndex(
                        feedbackOptions,
                        presentationId,
                        index
                      )}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
