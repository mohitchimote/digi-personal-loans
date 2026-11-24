// Shared shell logic across every wizard-step prototype page:
// step progress rendering + reusable interaction wiring, so the
// nine pages don't hand-roll the same nav markup and JS nine times.

const WIZARD_STEPS = [
  'Loan Requirements',
  'Personal Details',
  'Connect Bank',
  'Income & Employment',
  'Outgoings',
  'Credit Declarations',
  'Verify ID',
  'Direct Debit',
  'Review & Submit',
];

const PAGE_LEAVE_MS = 220; // matches body.is-leaving's CSS transition duration

function renderStepProgress(currentIndex) {
  const mount = document.getElementById('stepProgress');
  if (!mount) return;

  const list = document.createElement('ol');
  list.className = 'steps';
  WIZARD_STEPS.forEach((label, i) => {
    const li = document.createElement('li');
    const isCurrent = i === currentIndex;
    li.className = 'step' + (isCurrent ? ' is-current' : i < currentIndex ? ' is-done' : '');
    li.dataset.label = label;
    if (isCurrent) {
      const fill = document.createElement('span');
      fill.className = 'step__fill';
      li.appendChild(fill);
    }
    list.appendChild(li);
  });

  const caption = document.createElement('span');
  caption.className = 'topbar__step-label';
  caption.textContent = `Step ${currentIndex + 1} of ${WIZARD_STEPS.length} · ${WIZARD_STEPS[currentIndex]}`;

  mount.replaceChildren(list, caption);
  mount.setAttribute('role', 'progressbar');
  mount.setAttribute('aria-valuenow', String(currentIndex + 1));
  mount.setAttribute('aria-valuemin', '1');
  mount.setAttribute('aria-valuemax', String(WIZARD_STEPS.length));
  mount.setAttribute('aria-label', `Application step ${currentIndex + 1} of ${WIZARD_STEPS.length}`);
}

// Single-select pill/chip group (role="radiogroup" of .pill buttons).
function wireRadioGroup(group, onSelect) {
  if (!group) return;
  group.addEventListener('click', (e) => {
    const btn = e.target.closest('.pill');
    if (!btn) return;
    [...group.children].forEach((c) => c.setAttribute('aria-checked', 'false'));
    btn.setAttribute('aria-checked', 'true');
    onSelect(btn.dataset.value, btn);
  });
}

// Two-option segmented switch (.switch > .switch__thumb + 2x .switch__opt).
function wireSwitch(switchEl, onSelect) {
  if (!switchEl) return;
  switchEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.switch__opt');
    if (!btn) return;
    const opts = [...switchEl.querySelectorAll('.switch__opt')];
    const index = opts.indexOf(btn);
    opts.forEach((o) => { o.classList.remove('is-active'); o.setAttribute('aria-checked', 'false'); });
    btn.classList.add('is-active');
    btn.setAttribute('aria-checked', 'true');
    switchEl.dataset.active = String(index + 1);
    onSelect(btn.dataset.value, btn);
  });
}

function nis(n) {
  return '₪' + Math.round(Number(n) || 0).toLocaleString('en-US');
}

function initShell(currentIndex) {
  renderStepProgress(currentIndex);
}

// The one signature transition, used for every step-to-step navigation:
// play the leave state, then follow the link. Respects reduced motion by
// just navigating immediately (the CSS media query also disables the
// visual transition, but skipping the wait avoids a dead pause too).
function navigateTo(href) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) { window.location.href = href; return; }
  document.body.classList.add('is-leaving');
  window.setTimeout(() => { window.location.href = href; }, PAGE_LEAVE_MS);
}

// Wires Back/Continue nav for a wizard step page.
// opts: { prevHref, nextHref, validate: () => boolean, onValid?: () => void, customContinue?: boolean }
// Pass customContinue: true when the page wires its own Continue handler
// (e.g. Personal Details opens a consent modal first): this then only
// wires Back, so the two handlers don't both bind to #continueBtn.
function wireActionBar(opts) {
  const backBtn = document.querySelector('.actionbar .btn-ghost');
  const continueBtn = document.getElementById('continueBtn');

  if (backBtn && opts.prevHref) {
    backBtn.addEventListener('click', () => navigateTo(opts.prevHref));
  }

  if (continueBtn && !opts.customContinue) {
    continueBtn.addEventListener('click', () => {
      if (opts.validate && !opts.validate()) return;
      if (opts.onValid) opts.onValid();

      continueBtn.classList.add('is-loading');
      continueBtn.disabled = true;
      window.setTimeout(() => {
        if (opts.nextHref) {
          navigateTo(opts.nextHref);
        } else {
          continueBtn.classList.remove('is-loading');
          continueBtn.disabled = false;
        }
      }, 550);
    });
  }
}
