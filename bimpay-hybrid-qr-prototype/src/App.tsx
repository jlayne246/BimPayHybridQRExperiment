import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import ResolverPage from "./pages/ResolverPage";
import CreatePaymentQrPage from "./pages/CreatePaymentQrPage";

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
      </div>
    </BrowserRouter>
  );
}