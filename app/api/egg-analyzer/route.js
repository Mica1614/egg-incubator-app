export async function POST(req) {
  try {
    const { image } = await req.json();

    if (!image || typeof image !== "string") {
      return Response.json({ error: "Missing image" }, { status: 400 });
    }

    const analyzerUrl = process.env.EGG_ANALYZER_URL || "http://localhost:8000";

    // Strip data URL prefix if present (e.g. "data:image/jpeg;base64,...")
    const base64Data = image.includes(",") ? image.split(",")[1] : image;

    // Convert base64 → Buffer → Blob so Python's UploadFile receives a proper multipart file
    const buffer = Buffer.from(base64Data, "base64");
    const blob = new Blob([buffer], { type: "image/jpeg" });

    const formData = new FormData();
    formData.append("file", blob, "egg.jpg");

    const response = await fetch(`${analyzerUrl}/analyze`, {
      method: "POST",
      body: formData,
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      return Response.json(
        { error: errText || "Analysis failed" },
        { status: 502 }
      );
    }

    const data = await response.json();

    // Normalise response to a consistent shape for the frontend
    return Response.json({
      success: true,
      layer1_class: data.layer1_class,
      layer1_confidence: data.layer1_confidence,
      layer1_probs: data.layer1_probs,
      layer2_class: data.layer2_class ?? null,
      layer2_confidence: data.layer2_confidence ?? null,
      layer2_probs: data.layer2_probs ?? null,
      annotation_label: data.annotation_label,
      annotated_image: data.annotated_image ?? null,   // base64 annotated image with bounding boxes
      bounding_boxes: data.bounding_boxes ?? null,      // raw bounding box data if available
      inference_ms: data.inference_ms,
    });
  } catch (e) {
    if (e?.name === "TimeoutError") {
      return Response.json({ error: "Model server timed out" }, { status: 504 });
    }
    if (e?.cause?.code === "ECONNREFUSED") {
      return Response.json({ error: "scanner_unavailable" }, { status: 503 });
    }
    return Response.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const analyzerUrl = process.env.EGG_ANALYZER_URL || "http://localhost:8000";
    const response = await fetch(`${analyzerUrl}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    const data = await response.json();
    return Response.json(data);
  } catch (e) {
    return Response.json({ status: "offline", error: e?.message }, { status: 503 });
  }
}
