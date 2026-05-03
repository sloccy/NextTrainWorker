export function json(body: unknown, status: number, cacheControl?: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...(cacheControl ? { "Cache-Control": cacheControl } : {}),
    },
  });
}
