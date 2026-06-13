export function ExperimentalWarning() {
  return (
    <div
      className="rounded-2xl border border-amber-300 bg-amber-100 px-5 py-4 text-amber-950 shadow-sm"
      role="alert"
    >
      <p className="text-sm font-bold leading-6">
        Warning: Do not use these QR codes to make actual transactions with the BiMPay app
        or any other banking app. They are for experimental purposes only.
      </p>
    </div>
  );
}
