/** Actions that already have their own control (or their own flow elsewhere): the note composer, section
 * editing and product selection, the customer's own lifecycle, and the system's auto-approval. A screen
 * that renders "whatever the workflow offers" leaves these out so nothing appears twice. Everything
 * else an admin adds in the workflow builder shows up on its own. */
export const HAND_WIRED_ACTIONS: ReadonlySet<string> = new Set([
  'approve_conditional',
  'add_note', 'request_clarification', 'request_documents', 'edit_section',
  'save_section', 'select_product', 'submit', 'withdraw', 'cancel', 'auto_approve',
]);
