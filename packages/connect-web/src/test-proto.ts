import { create, toBinary, fromBinary } from "@bufbuild/protobuf";
import { EndStreamSchema } from "@connectrpc/connect/protocol";

const emptyEndStream = create(EndStreamSchema, {});
const binary = toBinary(EndStreamSchema, emptyEndStream);

const parsed = fromBinary(EndStreamSchema, binary);
console.log("parsed.error:", parsed.error);
console.log("typeof parsed.error:", typeof parsed.error);
console.log("keys in error:", parsed.error ? Object.keys(parsed.error) : "N/A");
