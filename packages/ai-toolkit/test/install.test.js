const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const INSTALL = path.join(ROOT, "install.js");
const UNINSTALL = path.join(ROOT, "uninstall.js");

function run(script, projectRoot) {
  return spawnSync(process.execPath, [script], {
    cwd: ROOT,
    env: { ...process.env, PROJECT_ROOT: projectRoot },
    encoding: "utf8",
  });
}

describe("ai-toolkit installer", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "ai-toolkit-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("installs rules block and manifest into an empty project", () => {
    const result = run(INSTALL, tmpDir);
    assert.equal(result.status, 0, result.stderr);

    const agentsMd = fs.readFileSync(path.join(tmpDir, "AGENTS.md"), "utf8");
    assert.match(agentsMd, /<!-- BEGIN @piotrwrotny\/ai-toolkit -->/);
    assert.match(agentsMd, /<!-- END @piotrwrotny\/ai-toolkit -->/);

    const manifest = JSON.parse(fs.readFileSync(path.join(tmpDir, ".claude", ".ai-toolkit-manifest.json"), "utf8"));
    assert.equal(manifest.package, "@piotrwrotny/ai-toolkit");
    assert.ok(manifest.files.includes("AGENTS.md"));
  });

  it("is idempotent: second run does not duplicate the block", () => {
    run(INSTALL, tmpDir);
    run(INSTALL, tmpDir);

    const agentsMd = fs.readFileSync(path.join(tmpDir, "AGENTS.md"), "utf8");
    const matches = agentsMd.match(/<!-- BEGIN @piotrwrotny\/ai-toolkit -->/g);
    assert.equal(matches.length, 1);
  });

  it("preserves existing AGENTS.md content outside the managed block", () => {
    const existing = "# Existing rules\n\nDo not touch this.\n";
    fs.writeFileSync(path.join(tmpDir, "AGENTS.md"), existing);

    run(INSTALL, tmpDir);

    const agentsMd = fs.readFileSync(path.join(tmpDir, "AGENTS.md"), "utf8");
    assert.match(agentsMd, /Do not touch this\./);
    assert.match(agentsMd, /<!-- BEGIN @piotrwrotny\/ai-toolkit -->/);
  });

  it("uninstall removes the managed block and manifest", () => {
    run(INSTALL, tmpDir);
    const result = run(UNINSTALL, tmpDir);
    assert.equal(result.status, 0, result.stderr);

    const agentsMd = fs.readFileSync(path.join(tmpDir, "AGENTS.md"), "utf8");
    assert.doesNotMatch(agentsMd, /<!-- BEGIN @piotrwrotny\/ai-toolkit -->/);
    assert.equal(fs.existsSync(path.join(tmpDir, ".claude", ".ai-toolkit-manifest.json")), false);
  });

  it("copies config templates only when the target does not exist", () => {
    fs.writeFileSync(path.join(tmpDir, ".gitattributes"), "custom\n");

    run(INSTALL, tmpDir);

    assert.equal(fs.readFileSync(path.join(tmpDir, ".gitattributes"), "utf8"), "custom\n");
    assert.ok(fs.existsSync(path.join(tmpDir, ".vscode", "settings.json")));
  });
});
