import { useState } from "react";
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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
          <div className="mx-auto max-w-7xl">
            <div className="flex items-center justify-between gap-3">
            <NavLink
              className="inline-flex items-center gap-2 font-black tracking-tight text-slate-950"
              to="/"
              onClick={() => setMobileMenuOpen(false)}
            >
              <img
                className="h-8 w-8 rounded-lg"
                src="/favicon.svg"
                alt=""
                aria-hidden="true"
              />
              <span>Hybrid QR Lab</span>
            </NavLink>

            <div className="hidden flex-1 items-center gap-1 md:flex">
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
              className="hidden rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-100 md:block"
              type="button"
              onClick={() => void signOut()}
            >
              Sign out
            </button>

            <button
              className="grid h-11 w-11 place-items-center rounded-xl border border-slate-300 text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-4 focus:ring-slate-200 md:hidden"
              type="button"
              aria-controls="mobile-navigation"
              aria-expanded={mobileMenuOpen}
              aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
              onClick={() => setMobileMenuOpen((open) => !open)}
            >
              {mobileMenuOpen ? (
                <svg
                  aria-hidden="true"
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" />
                </svg>
              ) : (
                <svg
                  aria-hidden="true"
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
                </svg>
              )}
            </button>
            </div>

            {mobileMenuOpen && (
              <div
                className="mt-3 space-y-1 border-t border-slate-200 pt-3 md:hidden"
                id="mobile-navigation"
              >
                <NavLink
                  className={({ isActive }) =>
                    `${navClass({ isActive })} block px-4 py-3`
                  }
                  end
                  to="/"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Home
                </NavLink>
                <NavLink
                  className={({ isActive }) =>
                    `${navClass({ isActive })} block px-4 py-3`
                  }
                  to="/experimental/generate"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  QR Generator
                </NavLink>
                <NavLink
                  className={({ isActive }) =>
                    `${navClass({ isActive })} block px-4 py-3`
                  }
                  to="/experimental/scan"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Scanner
                </NavLink>
                <NavLink
                  className={({ isActive }) =>
                    `${navClass({ isActive })} block px-4 py-3`
                  }
                  to="/scenarios"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Profile Scenarios
                </NavLink>
                <NavLink
                  className={({ isActive }) =>
                    `${navClass({ isActive })} block px-4 py-3`
                  }
                  to="/wallet"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Wallet Lab
                </NavLink>
                <button
                  className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-left text-sm font-bold text-slate-700 transition hover:bg-slate-100"
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    void signOut();
                  }}
                >
                  Sign out
                </button>
              </div>
            )}
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
