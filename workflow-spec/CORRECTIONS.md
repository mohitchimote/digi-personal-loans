# Deliberate differences from the pre-engine behaviour

The default definition (`loan-origination.v1.json`) reproduces the existing transitions, with the changes below. Each is a configuration choice: an admin can change it in the workflow builder without code. They are listed so the behaviour change is explicit and reviewable. Nothing is live on UAT/Prod yet.

| # | Area | Before | Now | Why |
|---|---|---|---|---|
| 1 | From-status guards | Staff decisions (approve, decline, send back, refer, approve with conditions) accepted **any** status, including DRAFT, DECLINED, WITHDRAWN and APPROVED | Only from SUBMITTED, UNDER_REVIEW, CONDITIONALLY_APPROVED, REFERRED_TO_SENIOR (approve with conditions: not CONDITIONALLY_APPROVED) | A declined or draft case could be approved by a direct call |
| 2 | Error code for a wrong state | `400` (Worker `AppError` default) for withdraw/cancel; nothing elsewhere | `409 INVALID_STATE` | A state conflict is not a malformed request |
| 3 | Disbursement | `authorise` and `second_check` worked on any case, even one never approved | Only when the case track is APPROVED; a second check is only from NOT_STARTED; funds cannot be released twice | Money movement on an unapproved or declined case |
| 4 | `/approve` (Java) | Open to **any authenticated user**, including customers | Requires entitlement `case.approve` | Security defect found in the Java `SecurityConfig` |
| 5 | Ownership of customer actions (Worker and Java) | withdraw, cancel, submit, select-product and the wizard section save had no ownership check: any logged-in user, including another customer or an underwriter, could act on any application | `OWNER_OR_ASSISTING` guard (the customer who owns it, or staff holding `case.actAsCustomer`) | Any logged-in user could act on any application. Confirmed by the parity run: another customer could cancel a draft, and an underwriter could save a customer's section |
| 6 | Org scope on staff actions | Worker applied `assertCaseVisible` only on approve, refer and reads; Java never | `CASE_VISIBLE` on every staff action | Branch-scoped roles could decline, send back or disburse cases outside their scope |
| 7 | Reason on decline / send back / refer | Required by the UI only | `REASON_REQUIRED` server-side | A direct call could record a decision with no reason |
| 8 | Save section | Set IN_PROGRESS from **any** status, including SUBMITTED, APPROVED, DECLINED | Only from DRAFT or IN_PROGRESS | Editing a submitted or decided application silently reverted it to IN_PROGRESS (confirmed by the parity run: a customer saving a section after submitting dropped a SUBMITTED case back to IN_PROGRESS at 20% complete) |
| 9 | Send back and referrals | Worker closed referrals but left `referredToRole` set; Java had no referrals | Clears `referredToRole` and closes the open referral | Stale target on a case no longer referred |
| 10 | Cancel and referrals | Referral rows and `referredToRole` left behind on a cancelled case | Closed and cleared | Same |
| 11 | Auto-approval | Not an explicit action; any code path could mark a case APPROVED | A `SYSTEM`-only `auto_approve` transition from UNDER_REVIEW, no entitlement or mandate check, still requires a positive amount | Keeps the system path explicit and impossible for a user to invoke |
| 12 | Approve amount | Java accepted a null approved amount | `AMOUNT_POSITIVE` (matches the Worker) | Parity |
| 13 | Over-mandate error | Java `IllegalArgumentException` (400), Worker `403` | `403 OVER_MANDATE` | Parity |
| 14 | Submit and select-product | No from-status guard: submit worked on a case in any status (a second submit re-stamped it, even an approved case could be re-submitted); select-product moved **any** case to UNDER_REVIEW | `submit` only from DRAFT or IN_PROGRESS; `select_product` only from SUBMITTED or UNDER_REVIEW | A decided case could be pulled back to review by a stray call |
| 15 | Mandate defaults on a fresh database | Migration 0013 copied the role-default limits from `mandate_rules`, but on a fresh database the migrations run before the seed that creates that table's row, so nothing was copied and every approval had a limit of 0 | Migration 0014 inserts the five defaults when absent (no-op where they exist) | Day-one UAT/Prod gotcha found while building the parity harness |

**Not changed (deliberately):** customer notifications and emails per transition, approval-letter generation, the card-payment generate-once behaviour, note text, and the note-type–driven customer notifications for clarification and document requests. Refer, second check and conditional approval still send no customer notification.

**Not moved into the workflow:** the customer wizard (`currentSection` progression, section validation, form versions), data-verification rule resolution, and the RED-flag exception-note rule (still enforced in the UI only; making it a server-side guard is an open follow-up).
