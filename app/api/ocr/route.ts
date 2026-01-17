import { NextResponse } from "next/server";
import vision from "@google-cloud/vision";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { imageBase64 } = await req.json();

    if (!imageBase64) {
      return NextResponse.json(
        { error: "No image provided" },
        { status: 400 }
      );
    }

    const client = new vision.ImageAnnotatorClient({
      apiKey: process.env.GOOGLE_CLOUD_VISION_API_KEY,
    });

    const [result] = await client.textDetection({
      image: { content: imageBase64 },
    });

    const text = result.fullTextAnnotation?.text ?? "";

    return NextResponse.json({ text });
  } catch (err) {
    console.error("OCR error:", err);
    return NextResponse.json(
      { error: "OCR failed" },
      { status: 500 }
    );
  }
}
