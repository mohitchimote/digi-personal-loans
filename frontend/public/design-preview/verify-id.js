// DigiBank — Verify ID (step 7 of 9)
// Drag-and-drop + click-to-browse upload, mirrors VerifyIdComponent
// (canContinue only once at least one file is "uploaded").

(() => {
  initShell(6);
  wireActionBar({
    prevHref: 'credit-declarations.html',
    nextHref: 'direct-debit.html',
    validate: () => uploadedFiles.length > 0,
  });

  const zone = document.getElementById('uploadZone');
  const fileInput = document.getElementById('fileInput');
  const fileList = document.getElementById('fileList');
  const continueBtn = document.getElementById('continueBtn');
  const uploadedFiles = [];
  const CHECK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/></svg>';

  function renderFiles() {
    fileList.innerHTML = uploadedFiles.map((name, i) => `
      <div class="file-row">${CHECK_ICON}<span class="file-row__name">${name}</span>
        <button class="file-row__remove" data-i="${i}" type="button">Remove</button></div>
    `).join('');
    continueBtn.disabled = uploadedFiles.length === 0;
  }

  function addFile(name) {
    uploadedFiles.push(name);
    renderFiles();
  }

  zone.addEventListener('click', () => fileInput.click());
  zone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') fileInput.click(); });
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) addFile(fileInput.files[0].name);
  });

  ['dragover', 'dragenter'].forEach((evt) => zone.addEventListener(evt, (e) => {
    e.preventDefault();
    zone.classList.add('is-dragover');
  }));
  ['dragleave', 'dragend'].forEach((evt) => zone.addEventListener(evt, () => zone.classList.remove('is-dragover')));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('is-dragover');
    const file = e.dataTransfer.files[0];
    if (file) addFile(file.name);
  });

  fileList.addEventListener('click', (e) => {
    const btn = e.target.closest('.file-row__remove');
    if (!btn) return;
    uploadedFiles.splice(Number(btn.dataset.i), 1);
    renderFiles();
  });
})();
