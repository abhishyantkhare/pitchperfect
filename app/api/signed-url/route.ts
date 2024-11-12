import { NextResponse } from "next/server";
import { ElevenLabsService } from "../services/ElevenLabsService";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const agentId = searchParams.get("agentId");
  if (!agentId) {
    return NextResponse.json({ error: "Agent ID is required" }, { status: 400 });
  }
  
  try {
    const signedUrl = await ElevenLabsService.getSignedUrl(agentId);
    return NextResponse.json({ signedUrl });
  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json(
      { error: "Failed to get signed URL" },
      { status: 500 }
    );
  }
}
