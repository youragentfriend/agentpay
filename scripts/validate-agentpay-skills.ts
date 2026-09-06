import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { OVERVIEW_SKILLS } from "../lib/server/overview-agent";

for (const name of OVERVIEW_SKILLS) {
  const directory = path.resolve(process.cwd(), "skills", name);
  const filename = path.join(directory, "SKILL.md");
  assert.ok(existsSync(filename), `${name} is missing SKILL.md`);
  const source = readFileSync(filename, "utf8");
  assert.match(source, /^---\n[\s\S]+?\n---\n/, `${name} must start with YAML frontmatter`);
  const declared = source.match(/^name:\s*["']?([^"'\n]+)["']?\s*$/m)?.[1]?.trim();
  const description = source.match(/^description:\s*["']?(.+?)["']?\s*$/m)?.[1]?.trim();
  assert.equal(declared, name, `${name} has mismatched frontmatter name`);
  assert.ok(description && description.length <= 1024, `${name} requires a bounded description`);
  for (const match of source.matchAll(/\]\((references\/[a-z0-9][a-z0-9-]*\.md)\)/g)) {
    const reference = path.resolve(directory, match[1]);
    assert.ok(reference.startsWith(`${directory}${path.sep}`) && existsSync(reference), `${name} references missing file ${match[1]}`);
  }
}

console.log(`Validated ${OVERVIEW_SKILLS.length} AgentPay skills.`);
