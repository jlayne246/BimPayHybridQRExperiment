import buildInfo from "../build-info.json";

type BuildInfo = {
  appVersion: string;
  buildDate: string;
  gitSha: string;
  gitBranch: string;
};

const info = buildInfo as BuildInfo;

export function BuildBadge() {
  return (
    <div className="fixed bottom-3 right-3 rounded-xl bg-slate-950/90 px-3 py-2 font-mono text-xs text-white shadow-lg">
      v{info.appVersion} · {info.gitSha} ·{" "}
      {new Date(info.buildDate).toLocaleString()}
    </div>
  );
}