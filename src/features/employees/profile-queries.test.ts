import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("./profile-queries.ts", import.meta.url),
  "utf8",
);

test(
  "expanded profile query uses the computed manager relationship",
  () => {
    assert.match(
      source,
      /manager:employee_manager\s*\(/,
    );

    assert.doesNotMatch(
      source,
      /manager:employees!employees_manager_id_fkey/,
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