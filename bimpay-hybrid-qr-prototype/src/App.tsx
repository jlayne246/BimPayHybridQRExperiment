import { BrowserRouter, NavLink, Route, Routes } from "react-router-dom";
import ResolverPage from "./pages/ResolverPage";
import CreatePaymentQrPage from "./pages/CreatePaymentQrPage";
import ScenarioLabPage from "./pages/ScenarioLabPage";
import WorkspaceHomePage from "./pages/WorkspaceHomePage";
import WalletLabPage from "./pages/WalletLabPage";
import { BuildBadge } from "./components/BuildBadge";
import { useAuth } from "./auth/useAuth";

export default function App() {
  const { signOut } = useAuth();
  const navClass = ({ isActive }: { isActive: boolean }) =>
    `rounded-xl px-3 py-2 text-sm font-bold transition ${
      isActive
        ? "bg-slate-950 text-white"
        : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
    }`;

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-100">
        <nav className="border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3">
            <NavLink
              className="mr-2 inline-flex items-center gap-2 font-black tracking-tight text-slate-950"
              to="/"
            >
              <img
                className="h-8 w-8 rounded-lg"
                src="/favicon.svg"
                alt=""
                aria-hidden="true"
              />
              <span>Hybrid QR Lab</span>
            </NavLink>
            <div className="flex flex-1 flex-wrap items-center gap-1">
              <NavLink className={navClass} end to="/">
                Home
              </NavLink>
              <NavLink className={navClass} to="/experimental/generate">
                QR Generator
              </NavLink>
              <NavLink className={navClass} to="/experimental/scan">
                Scanner
              </NavLink>
              <NavLink className={navClass} to="/scenarios">
                Profile Scenarios
              </NavLink>
              <NavLink className={navClass} to="/wallet">
                Wallet Lab
              </NavLink>
            </div>
            <button
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
              type="button"
              onClick={() => void signOut()}
            >
              Sign out
            </button>
          </div>
        </nav>

        <Routes>
          <Route path="/" element={<WorkspaceHomePage />} />
          <Route path="/pay" element={<ResolverPage />} />
          <Route path="/experimental/scan" element={<ResolverPage />} />
          <Route path="/experimental/generate" element={<CreatePaymentQrPage />} />
          <Route path="/scenarios" element={<ScenarioLabPage />} />
          <Route path="/wallet" element={<WalletLabPage />} />
          <Route path="/create" element={<CreatePaymentQrPage />} />
          <Route path="*" element={<WorkspaceHomePage />} />
        </Routes>

        <footer className="border-t bg-white px-6 py-4 text-center text-sm text-slate-500">
          Hybrid EMVCo QR Prototype - Independent, unofficial, test-only software for personal
          technical exploration. Not affiliated with or endorsed by BiMPay, the Central Bank
          of Barbados, EMVCo, any financial institution, or any payment provider.
          <BuildBadge />
        </footer>
      </div>
    </BrowserRouter>
  );
}
