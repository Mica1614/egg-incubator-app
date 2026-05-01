export async function POST(req) {
  try {
    const { image } = await req.json();

    if (!process.env.ROBOFLOW_API_KEY) {
      return Response.json(
        { error: "Missing ROBOFLOW_API_KEY" },
        { status: 500 }
      );
    }

    if (!process.env.ROBOFLOW_WORKFLOW_URL) {
      return Response.json(
        { error: "Missing ROBOFLOW_WORKFLOW_URL" },
        { status: 500 }
      );
    }

    if (!image || typeof image !== "string") {
      return Response.json({ error: "Missing image" }, { status: 400 });
    }

    const base64 = image.includes(",") ? image.split(",")[1] : image;

    const roboflowResponse = await fetch(process.env.ROBOFLOW_WORKFLOW_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: process.env.ROBOFLOW_API_KEY,
        inputs: {
          image: { type: "base64", value: base64 },
        },
      }),
    });

    const text = await roboflowResponse.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    if (!roboflowResponse.ok) {
      return Response.json(
        {
          error: "Roboflow request failed",
          status: roboflowResponse.status,
          data,
        },
        { status: 502 }
      );
    }

    return Response.json(data);
  } catch (e) {
    return Response.json(
      { error: e?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}
