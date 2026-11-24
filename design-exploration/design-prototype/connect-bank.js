// DigiBank — Connect Bank (step 3 of 9)
// Simulated Open Banking connect: pick a bank → connecting state →
// a real (fake-data) account summary row, mirroring ConnectBankComponent.

(() => {
  initShell(2);
  wireActionBar({ prevHref: 'personal-details.html', nextHref: 'income-employment.html' });

  const bankList = document.getElementById('bankList');
  const pickerSection = document.getElementById('pickerSection');
  const connectedSection = document.getElementById('connectedSection');
  const connectedList = document.getElementById('connectedList');

  function fakeSummary() {
    return {
      accountMasked: '**** **** **** ' + Math.floor(1000 + Math.random() * 9000),
      avgBalance: Math.floor(8000 + Math.random() * 12000),
      transactions: Math.floor(40 + Math.random() * 60),
    };
  }

  bankList.addEventListener('click', (e) => {
    const row = e.target.closest('.bank-row');
    if (!row) return;
    const bankName = row.dataset.bank;

    const connectingRow = document.createElement('div');
    connectingRow.className = 'connecting-row';
    connectingRow.innerHTML = `<span class="spinner"></span> Connecting to ${bankName}…`;
    connectedSection.style.display = 'block';
    connectedList.appendChild(connectingRow);
    pickerSection.style.display = 'none';

    window.setTimeout(() => {
      const summary = fakeSummary();
      connectingRow.remove();

      const row2 = document.createElement('div');
      row2.className = 'account-row';
      row2.innerHTML = `
        <span class="bank-row__mark">${bankName.split(' ').map(w => w[0]).slice(0, 2).join('')}</span>
        <div>
          <div class="account-row__bank">${bankName}</div>
          <div class="account-row__meta">${summary.accountMasked} · avg balance ${nis(summary.avgBalance)} · ${summary.transactions} txns / 90 days</div>
        </div>
        <span class="account-row__badge">Primary</span>
      `;
      connectedList.appendChild(row2);

      const addAnother = document.createElement('button');
      addAnother.className = 'link-edit';
      addAnother.type = 'button';
      addAnother.style.marginTop = '14px';
      addAnother.textContent = '+ Connect another account';
      addAnother.addEventListener('click', () => {
        pickerSection.style.display = 'block';
        addAnother.remove();
      });
      connectedList.appendChild(addAnother);
    }, 1600);
  });

  document.getElementById('manualLink').addEventListener('click', () => {
    const row = document.createElement('div');
    row.className = 'form-grid micro-reveal';
    row.style.marginTop = '16px';
    row.innerHTML = `
      <div class="field"><label class="input-label">Bank</label>
        <select class="select"><option>Bank Hapoalim</option><option>Bank Leumi</option><option>Discount Bank</option><option>Mizrahi-Tefahot</option></select></div>
      <div class="field"><label class="input-label">Account number</label><input class="input" placeholder="12345678"></div>
    `;
    document.getElementById('manualLink').replaceWith(row);
  });
})();
