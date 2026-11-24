// DigiBank — Income & Employment (step 4 of 9)
// Live-sums gross/net across the primary job plus any added
// employments, and flags net > gross, mirroring
// netNotGreaterThanGrossValidator + totalGrossIncome/totalNetIncome.

(() => {
  initShell(3);
  wireActionBar({
    prevHref: 'connect-bank.html',
    nextHref: 'outgoings.html',
    validate: () => {
      const gross = Number(document.getElementById('grossIncome').value) || 0;
      const net = Number(document.getElementById('netIncome').value) || 0;
      const error = document.getElementById('incomeError');
      if (net > gross) { error.hidden = false; error.textContent = 'Net income cannot be greater than gross income.'; return false; }
      error.hidden = true;
      return true;
    },
  });

  const extraContainer = document.getElementById('extraEmployments');
  const addBtn = document.getElementById('addEmploymentBtn');
  let extraCount = 0;

  function allIncomeInputs() {
    const primary = [document.getElementById('grossIncome'), document.getElementById('netIncome')];
    const extra = [...extraContainer.querySelectorAll('.extra-gross, .extra-net')];
    return { primary, extra };
  }

  function recalc() {
    const gross = Number(document.getElementById('grossIncome').value) || 0;
    const net = Number(document.getElementById('netIncome').value) || 0;
    const extraGross = [...extraContainer.querySelectorAll('.extra-gross')].reduce((s, el) => s + (Number(el.value) || 0), 0);
    const extraNet = [...extraContainer.querySelectorAll('.extra-net')].reduce((s, el) => s + (Number(el.value) || 0), 0);
    document.getElementById('totalGross').textContent = nis(gross + extraGross);
    document.getElementById('totalNet').textContent = nis(net + extraNet);
  }

  ['grossIncome', 'netIncome'].forEach((id) => document.getElementById(id).addEventListener('input', recalc));

  addBtn.addEventListener('click', () => {
    extraCount += 1;
    const block = document.createElement('section');
    block.className = 'field-group micro-reveal';
    block.innerHTML = `
      <div class="summary-section__head"><h2 class="field-label">Employment ${extraCount + 1} Details</h2>
        <button class="link-edit remove-employment" type="button">Remove</button></div>
      <div class="form-grid">
        <div class="field field--full"><label class="input-label">Employment Status</label>
          <select class="select"><option value="">Select…</option><option>Full-Time Employed</option><option>Part-Time Employed</option><option>Self-Employed</option><option>Contract</option></select></div>
        <div class="field"><label class="input-label">Employer Name</label><input class="input" placeholder="Company name"></div>
        <div class="field"><label class="input-label">Monthly Gross Income (₪)</label><input class="input extra-gross" type="number" min="0" value="0"></div>
        <div class="field"><label class="input-label">Monthly Net Income (₪)</label><input class="input extra-net" type="number" min="0" value="0"></div>
      </div>
    `;
    extraContainer.appendChild(block);
    block.querySelector('.extra-gross').addEventListener('input', recalc);
    block.querySelector('.extra-net').addEventListener('input', recalc);
    block.querySelector('.remove-employment').addEventListener('click', () => { block.remove(); recalc(); });
  });

  recalc();
})();
