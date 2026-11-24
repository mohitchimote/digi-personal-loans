import { SUPER_ADMIN_ROLE } from "./lenders";

// "Enter as": a lender admin (or a platform admin who has entered the lender) sees the screens as
// one of the lender's users. The session is a normal token for that user with an `act` claim naming
// the admin. Rules, checked when it starts and again on every request:
//  - the admin is enabled, and is an ADMIN of the user's lender or a SUPER_ADMIN inside it;
//  - the user is enabled, belongs to that lender, is not the admin, and is not an administrator;
//  - the session is READ-ONLY: it exists to see what the user sees, not to act as them, so an admin
//    cannot approve a loan as an underwriter and defeat the maker-checker separation.

type Party = { id: number; role: string; lenderId: number | null; enabled: boolean };

export type ViewAsDecision = { ok: true } | { ok: false; reason: string };

export function mayViewAs(actor: Party, target: Party, lenderInside: number | null): ViewAsDecision {
  if (!actor.enabled) return { ok: false, reason: "Your account is disabled." };
  const actorIsLenderAdmin = actor.role === "ADMIN" && actor.lenderId != null;
  const actorIsPlatformAdmin = actor.role === SUPER_ADMIN_ROLE && actor.lenderId == null && lenderInside != null;
  if (!actorIsLenderAdmin && !actorIsPlatformAdmin) return { ok: false, reason: "Only an administrator can view the system as another user." };
  if (target.lenderId == null || target.lenderId !== (actorIsLenderAdmin ? actor.lenderId : lenderInside)) return { ok: false, reason: "User not found." };
  if (target.id === actor.id) return { ok: false, reason: "You are already signed in as yourself." };
  if (!target.enabled) return { ok: false, reason: "That user is disabled." };
  if (target.role === "ADMIN" || target.role === SUPER_ADMIN_ROLE) return { ok: false, reason: "Administrators cannot be viewed as." };
  return { ok: true };
}

/** Requests an "enter as" session may make besides reading. */
export const VIEW_AS_ALLOWED_WRITES = new Set(["/api/auth/exit-impersonation", "/api/auth/logout"]);
export const isReadMethod = (m: string) => m === "GET" || m === "HEAD" || m === "OPTIONS";
