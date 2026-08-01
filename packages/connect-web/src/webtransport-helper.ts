// Copyright 2021-2026 The Connect Authors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { Code, ConnectError } from "@connectrpc/connect";
import {
  createEnvelopeReadableStream,
  encodeEnvelope,
  type EnvelopedMessage,
} from "@connectrpc/connect/protocol";

export interface WebTransportSession {
  createBidirectionalStream(): Promise<WebTransportBidirectionalStream>;
  readonly ready: Promise<void>;
}

export interface WebTransportBidirectionalStream {
  readonly readable: ReadableStream<Uint8Array>;
  readonly writable: WritableStream<Uint8Array>;
}

export async function runWebTransportCall(
  session: WebTransportSession,
  requestHeaders: Headers,
  requestMessages: AsyncIterable<Uint8Array>,
  writeHeaderFlag: number,
  writeDataFlag: number,
  path: string,
): Promise<{
  responseHeaders: Headers;
  responseMessages: AsyncIterable<EnvelopedMessage>;
}> {
  const stream = await session.createBidirectionalStream();
  const writer = stream.writable.getWriter();

  // Write request headers
  const metadata: Record<string, string[]> = {};
  requestHeaders.forEach((value, key) => {
    if (!metadata[key]) {
      metadata[key] = [];
    }
    metadata[key].push(value);
  });
  metadata[":path"] = [path];
  const encoder = new TextEncoder();
  const headersBytes = encoder.encode(JSON.stringify({ metadata }));
  await writer.write(encodeEnvelope(writeHeaderFlag, headersBytes));

  // Write request messages asynchronously so we can read the response concurrently
  const writePromise = (async () => {
    try {
      for await (const msg of requestMessages) {
        await writer.write(encodeEnvelope(writeDataFlag, msg));
      }
      await writer.close();
    } catch (err) {
      await writer.abort(err).catch(() => {});
      throw err;
    } finally {
      writer.releaseLock();
    }
  })();
  writePromise.catch(() => {});

  const envReader = createEnvelopeReadableStream(stream.readable).getReader();
  const firstResult = await envReader.read();
  if (firstResult.done) {
    throw new ConnectError(
      "protocol error: missing response headers",
      Code.Internal,
    );
  }
  const firstEnv = firstResult.value;
  if (firstEnv.flags !== writeHeaderFlag) {
    throw new ConnectError(
      `protocol error: expected headers envelope, got 0x${firstEnv.flags.toString(
        16,
      )}`,
      Code.Internal,
    );
  }
  const decoder = new TextDecoder();
  const parsedHeaderObj = JSON.parse(decoder.decode(firstEnv.data)) as {
    metadata?: Record<string, string[] | string>;
  };
  const responseHeaders = new Headers();
  if (parsedHeaderObj.metadata) {
    for (const [key, val] of Object.entries(parsedHeaderObj.metadata)) {
      if (Array.isArray(val)) {
        for (const v of val) {
          responseHeaders.append(key, v);
        }
      } else if (typeof val === "string") {
        responseHeaders.append(key, val);
      }
    }
  }

  async function* readResponseBody() {
    try {
      for (;;) {
        const result = await envReader.read();
        if (result.done) {
          break;
        }
        yield result.value;
      }
      await writePromise;
    } finally {
      envReader.releaseLock();
    }
  }

  return {
    responseHeaders,
    responseMessages: readResponseBody(),
  };
}
