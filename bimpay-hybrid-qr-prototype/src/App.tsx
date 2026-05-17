import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import ResolverPage from "./pages/ResolverPage";
import CreatePaymentQrPage from "./pages/CreatePaymentQrPage";
import { BuildBadge } from "./components/BuildBadge";

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-100">
        <nav className="border-b bg-white px-6 py-4">
          <div className="mx-auto flex max-w-7xl gap-4">
            <Link className="font-semibold text-slate-900" to="/">
              Resolver
            </Link>
            <Link className="font-semibold text-slate-900" to="/create">
              Create QR
            </Link>
          </div>
        </nav>

        <Routes>
          <Route path="/" element={<ResolverPage />} />
          <Route path="/pay" element={<ResolverPage />} />
          <Route path="/pay/:token" element={<ResolverPage />} />
          <Route path="/create" element={<CreatePaymentQrPage />} />
        </Routes>

        <footer className="border-t bg-white px-6 py-4 text-center text-sm text-slate-500">
          BimPay Hybrid QR Prototype - This is a proof of concept for personal exploration and not intended for actual use. <br></br>Not affiliated with BimPay, the Central Bank of Barbados, or any other company.
          <BuildBadge />
        </footer>
      </div>
    </BrowserRouter>
  );
}