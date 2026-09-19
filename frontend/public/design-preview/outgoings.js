// DigiBank — Outgoings (step 5 of 9)

(() => {
  initShell(4);
  wireActionBar({ prevHref: 'income-employment.html', nextHref: 'credit-declarations.html' });

  const inputs = [...document.querySelectorAll('.outgoing')];
  const total = document.getElementById('totalOutgoings');

  function recalc() {
    const sum = inputs.reduce((s, el) => s + (Number(el.value) || 0), 0);
    total.textContent = nis(sum);
  }
  inputs.forEach((el) => el.addEventListener('input', recalc));
  recalc();
})();
