export function ExperimentalWarning() {
  return (
    <div
      className="rounded-2xl border border-amber-300 bg-amber-100 px-5 py-4 text-amber-950 shadow-sm"
      role="alert"
    >
      <p className="text-sm font-black leading-6">Experimental Sandbox - No Real Transactions</p>
      <div className="mt-1 space-y-1 text-sm font-semibold leading-6">
        <p>
          This website and its QR codes are provided solely as an experimental sandbox for
          exploration, demonstration, and testing.
        </p>
        <p>
          This is an independent, unofficial prototype based on publicly observable QR
          payloads and behaviour seen when QR codes are inspected with general-purpose
          scanners outside payment apps. It has not been validated, approved, or certified by
          BiMPay, any financial institution, or EMVCo, and no guarantee is made regarding its
          accuracy, security, standards compliance, compatibility, or continued behaviour.
        </p>
        <p>
          Do not use these QR codes to make actual transactions with the BiMPay app or any
          other banking or payment app. If you choose to do so, you assume all associated
          risks, and the website owner and contributors accept no liability for any resulting
          loss, transaction, charge, error, or damage, to the fullest extent permitted by
          applicable law. Nothing here excludes liability or rights that cannot lawfully be
          excluded.
        </p>
        <p>
          Access is conditional on accepting these terms. Stop using the website if you do not
          agree.
        </p>
      </div>
    </div>
  );
}
