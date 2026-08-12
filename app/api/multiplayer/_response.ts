export const multiplayerJson = (body: unknown, status = 200) => Response.json(body, {
  status,
  headers: {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  },
});

export function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) throw new Error("Cross-origin multiplayer writes are not allowed.");
}

export async function requestBody(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) throw new Error("Expected a JSON request.");
  return await request.json() as Record<string, unknown>;
}

export function multiplayerError(error: unknown) {
  const message = error instanceof Error ? error.message : "The multiplayer request could not be completed.";
  const status = /authorized/i.test(message) ? 401
    : /not found|no match|no longer exists/i.test(message) ? 404
      : /already has two|no longer joinable|already advanced/i.test(message) ? 409
        : 400;
  return multiplayerJson({ error: message }, status);
}
