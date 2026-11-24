// DigiBank — Review & Submit (step 9 of 9)
// Reads amount/term carried over via sessionStorage from step 1 so
// the summary reflects what was actually picked, not fixed copy.
// canSubmit mirrors ReviewSubmitComponent: all 3 checks + a signature.

(() => {
  initShell(8);

  const amount = Number(sessionStorage.getItem('digibank-proto-amount')) || 50000;
  const term = Number(sessionStorage.getItem('digibank-proto-term')) || 36;

  function monthlyPayment(a, t) {
    const r = 0.055 / 12;
    return (a * r * Math.pow(1 + r, t)) / (Math.pow(1 + r, t) - 1);
  }

  document.getElementById('sumAmount').textContent = nis(amount);
  document.getElementById('sumTerm').textContent = term + ' months';
  document.getElementById('sumMonthly').textContent = nis(monthlyPayment(amount, term)) + '/mo';

  const checks = [...document.querySelectorAll('.consent-input')];
  const signature = document.getElementById('signature');
  const continueBtn = document.getElementById('continueBtn');
  const successOverlay = document.getElementById('successOverlay');

  function canSubmit() {
    return checks.every((c) => c.checked) && signature.value.trim().length > 2;
  }
  function updateSubmitState() {
    continueBtn.disabled = !canSubmit();
  }
  checks.forEach((c) => c.addEventListener('change', updateSubmitState));
  signature.addEventListener('input', updateSubmitState);

  wireActionBar({ prevHref: 'direct-debit.html', customContinue: true });

  continueBtn.addEventListener('click', () => {
    if (!canSubmit()) return;
    continueBtn.classList.add('is-loading');
    continueBtn.disabled = true;

    window.setTimeout(() => {
      document.body.classList.add('is-leaving');
      window.setTimeout(() => {
        document.body.classList.remove('is-leaving');
        successOverlay.hidden = false;
      }, 220);
    }, 550);
  });
})();
