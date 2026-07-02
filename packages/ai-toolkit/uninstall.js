#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const PACKAGE_NAME = "@piotrwrotny/ai-toolkit";
const BEGIN = `<!-- BEGIN ${PACKAGE_NAME} -->`;
const END = `<!-- END ${PACKAGE_NAME} -->`;
const MANIFEST = ".ai-toolkit-manifest.json";
const CONFIG_DIR = ".claude";

function findProjectRoot() {
  if (process.env.PROJECT_ROOT) {
    return path.resolve(process.env.PROJECT_ROOT);
  }

  return process.env.INIT_CWD ? path.resolve(process.env.INIT_CWD) : process.cwd();
}

function removeRulesBlock(content) {
  const start = content.indexOf(BEGIN);
  const end = content.indexOf(END);
  if (start === -1 || end === -1 || end < start) return content;
  return (content.slice(0, start) + content.slice(end + END.length)).replace(/\n{3,}/g, "\n\n");
}

function main() {
  const projectRoot = findProjectRoot();
  const manifestPath = path.join(projectRoot, CONFIG_DIR, MANIFEST);

  if (!fs.existsSync(manifestPath)) {
    console.log(`${PACKAGE_NAME}: no manifest found, nothing to uninstall`);
    return;
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  for (const relPath of manifest.files || []) {
    if (relPath === "AGENTS.md") continue;
    const fullPath = path.join(projectRoot, relPath);
    if (fs.existsSync(fullPath)) {
      fs.rmSync(fullPath, { recursive: true, force: true });
    }
  }

  const rulesPath = path.join(projectRoot, "AGENTS.md");
  if (fs.existsSync(rulesPath)) {
    fs.writeFileSync(rulesPath, removeRulesBlock(fs.readFileSync(rulesPath, "utf8")));
  }

  fs.rmSync(manifestPath, { force: true });
  console.log(`${PACKAGE_NAME}: uninstalled managed files from ${projectRoot}`);
}

main();
