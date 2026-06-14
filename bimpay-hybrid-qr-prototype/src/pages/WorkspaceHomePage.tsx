import { Link } from "react-router-dom";
import { ExperimentalWarning } from "../components/ExperimentalWarning";

const workspaces = [
  {
    eyebrow: "Low-level tools",
    title: "Experimental QR Lab",
    description:
      "Build EMVCo-style payloads field by field, generate multiple QR formats, scan images or cameras, and inspect TLV and CRC results.",
    links: [
      { label: "Generate QR", to: "/experimental/generate" },
      { label: "Scan and resolve", to: "/experimental/scan" },
    ],
    tone: "from-slate-950 to-slate-700",
  },
  {
    eyebrow: "Situational testing",
    title: "Profile Scenario Lab",
    description:
      "Use fictional people and merchants to model payment requests, payer confirmation, interpersonal transfers, and merchant checkout.",
    links: [{ label: "Open scenarios", to: "/scenarios" }],
    tone: "from-blue-700 to-indigo-600",
  },
  {
    eyebrow: "Funding-model testing",
    title: "Wallet Funding Lab",
    description:
      "Compare prepaid, bank-linked, and hybrid wallets. Test direct bank debits, stored value, fallback funding, and transfers between wallet models.",
    links: [{ label: "Open wallet", to: "/wallet" }],
    tone: "from-emerald-700 to-teal-600",
  },
];

export default function WorkspaceHomePage() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="rounded-[2rem] border border-slate-200 bg-white p-7 shadow-sm sm:p-10">
        <div className="max-w-3xl">
          <div className="text-xs font-black uppercase tracking-[0.2em] text-blue-700">
            BiMPay hybrid QR prototype
          </div>
          <h1 className="mt-4 text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">
            Choose a testing workspace
          </h1>
          <p className="mt-4 text-base leading-7 text-slate-600">
            Technical QR experimentation is kept separate from human payment scenarios so raw
            protocol work and transaction-flow testing can evolve independently.
          </p>
        </div>
      </header>

      <div className="mt-6">
        <ExperimentalWarning />
      </div>

      <section className="mt-6 grid gap-6 lg:grid-cols-3">
        {workspaces.map((workspace) => (
          <article
            className={`flex min-h-96 flex-col rounded-[2rem] bg-gradient-to-br ${workspace.tone} p-7 text-white shadow-xl sm:p-9`}
            key={workspace.title}
          >
            <div className="text-xs font-black uppercase tracking-[0.18em] text-white/70">
              {workspace.eyebrow}
            </div>
            <h2 className="mt-4 text-3xl font-black tracking-tight">{workspace.title}</h2>
            <p className="mt-4 max-w-xl text-sm leading-6 text-white/75">
              {workspace.description}
            </p>
            <div className="mt-auto flex flex-wrap gap-3 pt-10">
              {workspace.links.map((link) => (
                <Link
                  className="rounded-2xl bg-white px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-slate-100"
                  key={link.to}
                  to={link.to}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
