import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import ResolverPage from "./pages/ResolverPage";
import CreatePaymentQrPage from "./pages/CreatePaymentQrPage";
import { BuildBadge } from "./components/BuildBadge";
import { useAuth } from "./auth/useAuth";

export default function App() {
  const { signOut } = useAuth();

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-100">
        <nav className="border-b bg-white px-6 py-4">
          <div className="mx-auto flex max-w-7xl items-center gap-4">
            <div className="flex flex-1 gap-4">
              <Link className="font-semibold text-slate-900" to="/">
                Resolver
              </Link>
              <Link className="font-semibold text-slate-900" to="/create">
                Create QR
              </Link>
            </div>
            <button
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-700"
              type="button"
              onClick={() => void signOut()}
            >
              Sign out
            </button>
          </div>
        </nav>

        <Routes>
          <Route path="/" element={<ResolverPage />} />
          <Route path="/pay" element={<ResolverPage />} />
          <Route path="/create" element={<CreatePaymentQrPage />} />
          <Route path="*" element={<ResolverPage />} />
        </Routes>

        <footer className="border-t bg-white px-6 py-4 text-center text-sm text-slate-500">
          Hybrid EMVCo QR Prototype - This is a proof of concept for personal exploration with respect to possibilities for the BimPay Instant Payments System QR functionality and not intended for actual use. <br></br>Not affiliated with BimPay, the Central Bank of Barbados, or any other company.
          <BuildBadge />
        </footer>
      </div>
    </BrowserRouter>
  );
}
