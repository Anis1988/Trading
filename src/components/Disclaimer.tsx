export function Disclaimer() {
  return (
    <div className="border-b border-amber-700 bg-amber-950 px-4 py-2 text-center text-xs text-amber-200">
      Not a broker. This app does <b>not</b> execute trades and never calls a broker API. It only shows signals and emails/copies
      instructions — you must manually confirm and place any order in your Fidelity account. Not financial advice.
    </div>
  );
}
