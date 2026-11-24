// DigiBank — Personal Details (step 2 of 9)
// One continuous form, matching PersonalDetailsComponent's real structure
// and copy exactly (Identity Information / Current Address / Branch
// Assistance, no invented sub-screens). Demonstrates: simulated
// national-ID-database verification tick, the address-history threshold
// check (blocks Save & Continue, doesn't fragment the page), branch
// assistance reveal wired to the real DIGIBANK_BRANCH_STAFF data, and the
// consent modal that gates finishing the step (mirrors saveAndNext()).

(() => {
  initShell(1);

  const BRANCH_STAFF = {
    'Tel Aviv - Rothschild Blvd': ['Yael Cohen', 'Itai Mor', 'Shira Ben-Ari', 'Omer Katz'],
    'Jerusalem - Jaffa Road': ['Avi Steinberg', 'Noa Friedman', 'Eitan Azulay'],
    'Haifa - Hadar': ['Liat Peretz', 'Ronen Asaf', 'Dana Shapiro', 'Gil Bar-On'],
    'Beer Sheva - Old City': ['Maya Sasson', 'Tomer Halevi', 'Adi Malka'],
    'Netanya - City Center': ['Yossi Amar', 'Keren Tzur', 'Nadav Eliyahu', 'Sigal Dotan'],
    'Eilat - Tourist Center': ['Roni Vaknin', 'Eyal Barkan', 'Hila Marom'],
  };

  const ICON_CHECKING = '<span class="spinner" style="width:12px;height:12px;"></span> Checking national ID registry…';
  const ICON_VERIFIED = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/></svg> Verified against the national ID registry';

  // --- National ID verification simulation ---
  const nationalId = document.getElementById('nationalId');
  const idIssueDate = document.getElementById('idIssueDate');
  const verifyStatus = document.getElementById('verifyStatus');

  function checkVerification() {
    const idValid = /^\d{9}$/.test(nationalId.value.trim());
    const dateValid = !!idIssueDate.value && new Date(idIssueDate.value) <= new Date();
    verifyStatus.className = 'verify-status';
    verifyStatus.innerHTML = '';
    if (idValid && dateValid) {
      verifyStatus.classList.add('is-checking');
      verifyStatus.innerHTML = ICON_CHECKING;
      window.setTimeout(() => {
        verifyStatus.className = 'verify-status is-verified';
        verifyStatus.innerHTML = ICON_VERIFIED;
      }, 700);
    }
  }
  nationalId.addEventListener('input', checkVerification);
  idIssueDate.addEventListener('change', checkVerification);
  checkVerification();

  // --- Address history (ADDRESS_HISTORY_TARGET_MONTHS = 36, matches the real component) ---
  const monthsInput = document.getElementById('months');
  const addressHint = document.getElementById('addressHint');
  const previousAddresses = document.getElementById('previousAddresses');
  const addAddressBtn = document.getElementById('addAddressBtn');
  const TARGET_MONTHS = 36;
  let extraMonths = 0;
  let addressError = null;

  function needsMoreAddressHistory() {
    return totalAddressMonths() < TARGET_MONTHS;
  }

  function totalAddressMonths() {
    return (Number(monthsInput.value) || 0) + extraMonths;
  }

  function renderAddressState() {
    addressHint.textContent = `${totalAddressMonths()} of ${TARGET_MONTHS} months of address history captured.`;
    addAddressBtn.hidden = !needsMoreAddressHistory();
  }
  monthsInput.addEventListener('input', renderAddressState);
  renderAddressState();

  addAddressBtn.addEventListener('click', () => {
    const block = document.createElement('div');
    block.className = 'form-grid micro-reveal';
    block.style.marginTop = '16px';
    block.innerHTML = `
      <div class="field field--full"><label class="input-label">Street Address</label><input class="input" placeholder="8 Ben Yehuda St"></div>
      <div class="field"><label class="input-label">City</label><input class="input" placeholder="Ramat Gan"></div>
      <div class="field"><label class="input-label">Post Code</label><input class="input"></div>
      <div class="field"><label class="input-label">Country</label><input class="input" value="Israel"></div>
      <div class="field"><label class="input-label">Length at this Address (months)</label><input class="input prev-months" type="number" min="0" value="24"></div>
    `;
    previousAddresses.appendChild(block);
    const monthsField = block.querySelector('.prev-months');
    extraMonths += Number(monthsField.value) || 0;
    renderAddressState();
    monthsField.addEventListener('input', () => {
      extraMonths = [...previousAddresses.querySelectorAll('.prev-months')]
        .reduce((sum, el) => sum + (Number(el.value) || 0), 0);
      renderAddressState();
    });
  });

  // --- Branch assistance ---
  const assistSwitch = document.getElementById('assistSwitch');
  const branchFields = document.getElementById('branchFields');
  const branchSelect = document.getElementById('branch');
  const staffSelect = document.getElementById('staffName');

  wireSwitch(assistSwitch, (value) => {
    branchFields.style.display = value === 'yes' ? 'grid' : 'none';
  });

  branchSelect.addEventListener('change', () => {
    const staff = BRANCH_STAFF[branchSelect.value] || [];
    staffSelect.innerHTML = staff.length
      ? '<option value="">Select…</option>' + staff.map(n => `<option>${n}</option>`).join('')
      : '<option value="">Select…</option>';
  });

  // --- Consent modal (only reached once the rest of the form is valid) ---
  const modal = document.getElementById('consentModal');
  const consentStep = document.getElementById('consentStep');
  const consentRecorded = document.getElementById('consentRecorded');
  const consentInputs = [...document.querySelectorAll('#consentStep .consent-input')];
  const consentConfirm = document.getElementById('consentConfirm');
  const consentCancel = document.getElementById('consentCancel');
  const consentContinue = document.getElementById('consentContinue');
  const continueBtn = document.getElementById('continueBtn');

  function updateConsentState() {
    consentConfirm.disabled = !consentInputs.every((c) => c.checked);
  }
  consentInputs.forEach((c) => c.addEventListener('change', updateConsentState));
  consentCancel.addEventListener('click', () => { modal.hidden = true; });

  consentConfirm.addEventListener('click', () => {
    if (consentConfirm.disabled) return;
    consentConfirm.classList.add('is-loading');
    consentConfirm.disabled = true;
    window.setTimeout(() => {
      consentConfirm.classList.remove('is-loading');
      consentStep.hidden = true;
      consentRecorded.hidden = false;
    }, 450);
  });

  consentContinue.addEventListener('click', () => {
    navigateTo('connect-bank.html');
  });

  // --- Save & Continue ---
  wireActionBar({ prevHref: 'index.html', customContinue: true });

  continueBtn.addEventListener('click', () => {
    if (needsMoreAddressHistory()) {
      addressError = document.getElementById('addressHistoryError');
      if (!addressError) {
        addressError = document.createElement('p');
        addressError.id = 'addressHistoryError';
        addressError.className = 'input-error-text';
        addressError.style.marginTop = '12px';
        addressError.textContent = 'Please add enough previous address history to cover at least 3 years — this is required for credit checks.';
        previousAddresses.parentElement.appendChild(addressError);
      }
      addressError.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    modal.hidden = false;
  });
})();
