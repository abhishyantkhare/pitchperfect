import { ConvAI } from "@/components/ConvAI";
import { Suspense } from "react";

export default function Home() {
  return (
    <main className="min-h-screen w-full">
      <Suspense fallback={<div>Loading...</div>}>
        <ConvAI />
      </Suspense>
    </main>
  );
}
