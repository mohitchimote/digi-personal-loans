// DigiBank — Loan Requirements design exploration (step 1 of 9)
// Mirrors the real LoanRequirementsComponent's data shape
// (amount/purpose/term/applicants) and repayment math (5.5%
// representative rate, standard amortization) so the numbers on
// screen are honest, not placeholder filler.

(() => {
  initShell(0);

  const amountSlider = document.getElementById('amountSlider');
  const amountFigure = document.getElementById('amountFigure');
  const monthlyFigure = document.getElementById('monthlyFigure');
  const termEcho = document.getElementById('termEcho');
  const purposeGroup = document.getElementById('purposeGroup');
  const termGroup = document.getElementById('termGroup');
  const purposeError = document.getElementById('purposeError');
  const purposeField = purposeGroup.closest('.field-group');
  const applicantsSwitch = document.getElementById('applicantsSwitch');

  const state = { amount: 50000, purpose: null, term: 36, applicants: 1 };

  function monthlyPayment(amount, termMonths) {
    const r = 0.055 / 12;
    if (!amount || !termMonths) return 0;
    return (amount * r * Math.pow(1 + r, termMonths)) / (Math.pow(1 + r, termMonths) - 1);
  }

  function renderAmount() {
    amountFigure.textContent = state.amount.toLocaleString('en-US');
    const pct = ((state.amount - 5000) / (300000 - 5000)) * 100;
    amountSlider.style.setProperty('--fill', pct + '%');
    amountFigure.classList.add('is-pulsing');
    window.clearTimeout(renderAmount._t);
    renderAmount._t = window.setTimeout(() => amountFigure.classList.remove('is-pulsing'), 220);
    renderRepayment();
  }

  function renderRepayment() {
    monthlyFigure.textContent = nis(monthlyPayment(state.amount, state.term));
    termEcho.textContent = state.term + ' months';
  }

  amountSlider.addEventListener('input', (e) => {
    state.amount = Number(e.target.value);
    renderAmount();
  });

  wireRadioGroup(purposeGroup, (value) => {
    state.purpose = value;
    purposeField.classList.remove('has-error');
    purposeError.hidden = true;
  });

  wireRadioGroup(termGroup, (value) => {
    state.term = Number(value);
    renderRepayment();
  });

  wireSwitch(applicantsSwitch, (value) => {
    state.applicants = Number(value);
    sessionStorage.setItem('digibank-proto-applicants', String(state.applicants));
  });

  wireActionBar({
    prevHref: null,
    nextHref: 'personal-details.html',
    validate: () => {
      if (!state.purpose) {
        purposeField.classList.add('has-error');
        purposeError.hidden = false;
        purposeGroup.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return false;
      }
      return true;
    },
    onValid: () => {
      sessionStorage.setItem('digibank-proto-amount', String(state.amount));
      sessionStorage.setItem('digibank-proto-term', String(state.term));
    },
  });

  document.querySelector('.actionbar .btn-ghost').setAttribute('disabled', 'true');
  document.querySelector('.actionbar .btn-ghost').style.opacity = '0.35';
  document.querySelector('.actionbar .btn-ghost').style.pointerEvents = 'none';

  renderAmount();
})();
