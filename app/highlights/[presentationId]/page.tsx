"use client";

import Spinner from "@/components/Spinner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { supabaseClient as supabase } from "@/utils/supabase/client";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

const SUPABASE_BUCKET_NAME = "pitchperfectfiles";

// Define a type for the weak area
type WeakArea = {
  start_time: number;
  explanation: string;
  improvement: string;
  transcript: string;
};

// Define a type for the API response
type ApiResponse = {
  id: string;
  created_at: string;
  topic: string;
  weak_areas: {
    weak_areas: WeakArea[];
  };
  audio_file: string;
  signedAudioUrl: string;
};

// Define a type for the presentation data
type PresentationData = {
  id: string;
  created_at: string;
  topic: string;
  weak_areas: {
    weak_areas: WeakArea[];
  };
  audio_file: string;
  signedAudioUrl: string;
};

// This is a mock function to simulate fetching data from the server
const fetchPresentationData = async (
  presentationId: string
): Promise<PresentationData | null> => {
  console.log("fetching presentation data for presentationId:", presentationId);
  try {
    console.log(`/api/presentation/${presentationId}/recording`);
    const response = await fetch(
      `/api/presentation/${presentationId}/recording`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
    console.log("response", response);

    if (!response.ok) {
      throw new Error("Failed to fetch presentation data");
    }

    const data: ApiResponse = await response.json();
    console.log("data", data);

    return data;
  } catch (error) {
    console.error("Error fetching presentation data:", error);
    return null;
  }
};

export default function Component() {
  const { presentationId } = useParams();

  // Use the defined type for the state
  const [presentationData, setPresentationData] =
    useState<PresentationData | null>(null);
  const [audioUrls, setAudioUrls] = useState<string[]>([]);
  const [feedbackOptions, setFeedbackOptions] = useState<[]>([]);
  const [isPageLoading, setIsPageLoading] = useState(true);

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

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsPageLoading(false);
    }, 6000);

    return () => clearTimeout(timer);
  }, []);

  const handlePlayFromTimestamp = (
    audioElement: HTMLAudioElement,
    timestamp: number
  ) => {
    audioElement.currentTime = timestamp;
    audioElement.play();
  };

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
            {presentationData.topic}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* <ScrollArea className="h-[calc(100vh-200px)]"> */}
          <div className="space-y-6 h-full">
            <audio
              id="audio-player"
              controls
              className="w-full rounded-md bg-black border-white"
            >
              <source src={presentationData.signedAudioUrl} type="audio/mp3" />
              Presentation: Your browser does not support the audio element.
            </audio>

            {presentationData.weak_areas.weak_areas.map((area, index) => (
              <Card key={index} className="bg-gray-800 text-white p-4">
                <div className="flex justify-between items-start flex-col gap-4">
                  <div className="w-full flex flex-col gap-2">
                    <h3 className="text-lg font-bold flex flex-row gap-2 items-center">
                      <span className="text-white whitespace-nowrap">
                        Weak Area {index + 1}:
                      </span>
                      <div className="flex flex-row gap-2 justify-start w-full ">
                        <p className="">[{area.start_time}s]</p>
                        <p className=" italic font-bold ">
                          {" "}
                          ...
                          {area.transcript
                            .replace("User:", "")
                            .replace('""', "")
                            .replace('"', "")
                            .trim()}
                          ...
                        </p>
                      </div>
                    </h3>

                    <p className="text-sm">
                      <span className="font-bold">Explanation:</span>{" "}
                      {area.explanation}
                    </p>
                    <p className="text-sm">
                      <span className="font-bold">Improvement:</span>{" "}
                      {area.improvement}
                    </p>
                  </div>
                  <Button
                    onClick={() => {
                      const audioElement = document.getElementById(
                        "audio-player"
                      ) as HTMLAudioElement;
                      handlePlayFromTimestamp(audioElement, area.start_time);
                    }}
                  >
                    Play
                  </Button>
                </div>
              </Card>
            ))}
          </div>
          {/* </ScrollArea> */}
        </CardContent>
      </Card>
    </div>
  );
}
