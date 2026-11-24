// Which lender the public pages (branding, FAQs, registration pick-lists) are for when nobody is
// signed in. A signed-in user's token already carries it. Sources, in order: ?lender=CODE in the
// page link (a lender gives its customers that link), then the code remembered from the last
// sign-in or typed on the login page. With a single lender no code is needed at all.
const KEY = 'lenderCode';

export function rememberLender(code: string | null | undefined): void {
  const c = code?.trim();
  if (c) localStorage.setItem(KEY, c);
}

export function rememberedLender(): string | null {
  return localStorage.getItem(KEY);
}

/** Call once at startup: a ?lender=CODE in the address is remembered. */
export function captureLenderFromUrl(): void {
  rememberLender(new URLSearchParams(window.location.search).get('lender'));
}
