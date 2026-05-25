export function binResponse(buf: Uint8Array, maxAge: number): Response {
  return new Response(buf, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Cache-Control": `public, max-age=${maxAge}`,
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export function jsonResponse(data: unknown, maxAge: number): Response {
  return new Response(JSON.stringify(data), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `public, max-age=${maxAge}`,
      "Access-Control-Allow-Origin": "*",
    },
  });
}
