import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      hint: "Use POST with JSON body: { imageBase64: '...base64...' }",
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

function stripDataUrl(base64: string) {
  // akzeptiert sowohl "data:image/png;base64,AAAA" als auch "AAAA"
  const idx = base64.indexOf("base64,");
  return idx >= 0 ? base64.slice(idx + "base64,".length) : base64;
}

export async function POST(req: Request) {
  try {
    const { imageBase64 } = await req.json();

    if (!imageBase64) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing GOOGLE_CLOUD_VISION_API_KEY env var" },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      );
    }

    const content = stripDataUrl(String(imageBase64).trim());

    const url = `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(
      apiKey
    )}`;

    const body = {
      requests: [
        {
          image: { content },
          features: [{ type: "TEXT_DETECTION" }],
        },
      ],
    };

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
      body: JSON.stringify(body),
    });

    const data = await resp.json();

    if (!resp.ok) {
      return NextResponse.json(
        {
          error: "OCR failed (Vision API)",
          details: data,
        },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      );
    }

    const text =
      data?.responses?.[0]?.fullTextAnnotation?.text ??
      data?.responses?.[0]?.textAnnotations?.[0]?.description ??
      "";

    return NextResponse.json(
      { text },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("OCR error:", err);
    return NextResponse.json(
      { error: "OCR failed" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
