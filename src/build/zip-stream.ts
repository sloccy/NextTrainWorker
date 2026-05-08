import { Unzip, UnzipInflate, UnzipPassThrough } from "fflate";

export type ChunkHandler = (chunk: Uint8Array, final: boolean) => void;

/**
 * Streams a remote zip, routing decompressed file chunks to named handlers.
 * Files not in `handlers` are decompressed and discarded.
 */
export async function streamZipFiles(
  url: string,
  handlers: Record<string, ChunkHandler>,
): Promise<void> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Fetch ${url} failed: ${resp.status}`);
  if (!resp.body) throw new Error("Response body is null");

  await new Promise<void>((resolve, reject) => {
    const unzip = new Unzip((stream) => {
      const handler = handlers[stream.name];
      stream.ondata = handler
        ? (err, data, final) => {
            if (err) { reject(err); return; }
            handler(data, final);
          }
        : () => {};
      stream.start();
    });

    unzip.register(UnzipInflate);
    unzip.register(UnzipPassThrough);

    const reader = resp.body!.getReader();
    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read();
        unzip.push(value ?? new Uint8Array(0), done);
        if (done) break;
      }
      resolve();
    };
    pump().catch(reject);
  });
}
