// Which workflow actions get an audit-trail row named after their event. Pure, so it can be tested
// without a database.

interface AuditSubject {
  from: { status: string };
  to: { status: string };
  hostEffects: { type: string }[];
  log: { actorType: string };
}

/** True when the host should write an audit row for the action's event.
 *
 * Every action that moves a case, and every staff action, is audited. Two kinds are not:
 * - a customer's in-place action that changes no status (wizard autosaves would flood the table), and
 * - a note-only action that changes no status (adding a note, asking for documents): the note's own
 *   audit entry, named after its note type, already records it, so a second row would double-count. */
export function auditsEvent(r: AuditSubject): boolean {
  const moved = r.from.status !== r.to.status;
  if (moved) return true;
  if (r.log.actorType === "CUSTOMER") return false;
  return !r.hostEffects.some((e) => e.type === "NOTE");
}
