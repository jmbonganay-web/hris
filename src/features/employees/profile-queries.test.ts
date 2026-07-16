import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("./profile-queries.ts", import.meta.url),
  "utf8",
);

test(
  "expanded profile query uses an ownership-scoped manager summary RPC",
  () => {
    assert.match(
      source,
      /\.rpc\(\s*["']get_employee_manager_summary["']/,
    );

    assert.doesNotMatch(
      source,
      /manager:employee_manager\s*\(/,
    );
  },
);

test(
  "expanded profile query uses private signed avatar URLs",
  () => {
    assert.match(source, /createSignedUrl/);
    assert.match(source, /employee-avatars/);
  },
);