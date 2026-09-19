// DigiBank — Credit Declarations (step 6 of 9)
// Credit score itself is intentionally never shown here — matches
// the real CreditDeclarationsComponent, which generates it
// underwriter-side only (see DESIGN.md/PRODUCT.md notes).

(() => {
  initShell(5);
  wireActionBar({ prevHref: 'outgoings.html', nextHref: 'verify-id.html' });

  document.querySelectorAll('.declaration-row .switch').forEach((s) => wireSwitch(s, () => {}));
})();
