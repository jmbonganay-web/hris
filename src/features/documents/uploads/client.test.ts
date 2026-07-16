import test from "node:test";
import assert from "node:assert/strict";
import { matchUploadTicketsToFiles } from "./client.ts";

test("upload tickets bind to files by stable client key", () => {
  const files = [
    { clientFileKey: "front", file: { name: "front.pdf" } },
    { clientFileKey: "back", file: { name: "back.pdf" } },
  ];
  const tickets = [
    { clientFileKey: "back", path: "p2", token: "t2" },
    { clientFileKey: "front", path: "p1", token: "t1" },
  ];
  assert.deepEqual(matchUploadTicketsToFiles(files, tickets).map((item) => item.ticket.path), ["p1", "p2"]);
});

test("missing or duplicate upload tickets are rejected", () => {
  assert.throws(() => matchUploadTicketsToFiles(
    [{ clientFileKey: "front", file: { name: "front.pdf" } }],
    [{ clientFileKey: "other", path: "p1", token: "t1" }],
  ), /DOCUMENT_UPLOAD_SESSION_INVALID/);
});
