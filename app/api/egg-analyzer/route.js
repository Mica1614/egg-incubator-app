export async function POST(req) {
  try {
    const { image } = await req.json();

    if (!image || typeof image !== "string") {
      return Response.json({ error: "Missing image" }, { status: 400 });
    }

    const analyzerUrl = process.env.EGG_ANALYZER_URL || "http://localhost:8000";

    const response = await fetch(`${analyzerUrl}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image }),
      signal: AbortSignal.timeout(30000),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      return Response.json(
        { error: data.error || "Analysis failed" },
        { status: 502 }
      );
    }

    return Response.json(data);
  } catch (e) {
    if (e?.name === "TimeoutError") {
      return Response.json({ error: "Model server timed out" }, { status: 504 });
    }
    if (e?.cause?.code === "ECONNREFUSED") {
      return Response.json(
        { error: "Egg analyzer server is not running. Start it with: uvicorn main:app --port 8000" },
        { status: 503 }
      );
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
