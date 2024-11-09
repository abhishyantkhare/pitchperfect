"use client";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export default function Home() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [topic, setTopic] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      setUploadedFiles((prev) => [...prev, ...Array.from(files)]);
      event.target.value = "";
    }
  };

  const removeFile = (indexToRemove: number) => {
    setUploadedFiles((prev) =>
      prev.filter((_, index) => index !== indexToRemove)
    );
  };

  const clearAllFiles = () => {
    setUploadedFiles([]);
  };

  const handleCreatePresentation = async () => {
    if (!topic.trim()) {
      // You might want to show an error message to the user here
      return;
    }

    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append("topic", topic);
      uploadedFiles.forEach((file) => {
        formData.append("files", file);
      });

      const response = await fetch("/api/presentation", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (data.id) {
        router.push(`/agents?presentationId=${data.id}`);
      }
    } catch (error) {
      console.error("Error creating presentation:", error);
      // You might want to show an error message to the user here
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white font-[family-name:var(--font-geist-sans)] w-screen">
      <main className="flex flex-col items-center justify-center min-h-screen gap-8 p-8 sm:p-20">
        <div className="flex flex-col gap-4 w-full max-w-2xl">
          <h2 className="text-2xl font-semibold text-center">
            What do you want to practice today?
          </h2>
          <div className="flex flex-row gap-2">
            <input
              type="text"
              className="w-full border border-gray-600 rounded-md p-3 bg-gray-800 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Type your practice topic here..."
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
            <Button
              className="bg-blue-600 hover:bg-blue-700 transition-colors p-6"
              size="lg"
              onClick={handleCreatePresentation}
              disabled={isLoading || !topic.trim()}
            >
              {isLoading ? "Creating..." : "Go"}
            </Button>
          </div>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
            multiple
          />
          <div className="flex flex-col gap-3">
            <Button
              onClick={handleUploadClick}
              className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-600 rounded-md transition-colors self-start hover:bg-gray-700"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              Upload supporting materials
            </Button>

            {uploadedFiles.length > 0 && (
              <div className="flex flex-col gap-2 mt-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-400">Uploaded files:</span>
                  <Button
                    onClick={clearAllFiles}
                    variant="ghost"
                    className="text-xs text-red-400 hover:text-red-300 p-0 h-auto"
                  >
                    Clear all
                  </Button>
                </div>
                {uploadedFiles.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between gap-2 text-sm text-gray-300 group"
                  >
                    <div className="flex items-center gap-2">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                        <line x1="10" y1="9" x2="8" y2="9" />
                      </svg>
                      {file.name}
                    </div>
                    <button
                      onClick={() => removeFile(index)}
                      className="transition-opacity text-gray-500 hover:text-red-400"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
