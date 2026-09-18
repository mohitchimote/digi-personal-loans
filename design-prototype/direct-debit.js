// DigiBank — Direct Debit (step 8 of 9)

(() => {
  initShell(7);
  const authConfirm = document.getElementById('authConfirm');
  let authError = null;

  wireActionBar({
    prevHref: 'verify-id.html',
    nextHref: 'review-submit.html',
    validate: () => {
      if (authConfirm.checked) return true;
      if (!authError) {
        authError = document.createElement('p');
        authError.className = 'input-error-text';
        authError.style.marginTop = '8px';
        authError.textContent = 'You must authorise direct debit collection to continue.';
        authConfirm.closest('.consent-check').after(authError);
      }
      return false;
    },
  });

  const repaymentDay = document.getElementById('repaymentDay');
  repaymentDay.innerHTML = Array.from({ length: 28 }, (_, i) => i + 1)
    .map((d) => `<option ${d === 1 ? 'selected' : ''}>${d}</option>`).join('');
})();
