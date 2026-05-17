import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

function safeExec(command, fallback = "") {
  try {
    return execSync(command, { encoding: "utf8" }).trim();
  } catch {
    return fallback;
  }
}

const packageJson = JSON.parse(
  safeExec("node -p \"JSON.stringify(require('./package.json'))\"", "{}")
);

const buildInfo = {
  appVersion: packageJson.version ?? "0.0.0",
  buildDate: new Date().toISOString(),
  gitSha: safeExec("git rev-parse --short HEAD", "unknown"),
  gitBranch: safeExec("git rev-parse --abbrev-ref HEAD", "unknown"),
};

writeFileSync(
  "src/build-info.json",
  JSON.stringify(buildInfo, null, 2) + "\n"
);

console.log("Generated src/build-info.json", buildInfo);