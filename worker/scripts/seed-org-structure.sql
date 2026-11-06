-- Demo data for the org hierarchy, role-based entitlements and context-aware mandates
-- (Bank Yahav gaps Y1, Y4, Y11). Throwaway demo content like seed-pipeline-test-data.sql, so it is
-- not part of seed-generate.ts. Requires migrations 0011-0013 (levels + default roles/mandates are
-- seeded there) and seed-pipeline-test-data.sql (the DGB-2026-100xx cases). Safe to re-run: every
-- statement is guarded, and nothing here removes or rewrites existing rows except assigning the
-- org unit / referral target of the demo cases and the demo banker.
--
-- Structure:  Head Office
--               +- North   -> Haifa
--               +- Central -> Tel Aviv, Petah Tikva
--               +- South   -> Beer Sheva

-- ---------------------------------------------------------------- org units
INSERT INTO org_units (code, name, level_id, parent_id, active, created_at)
SELECT 'HQ', 'Head Office', (SELECT id FROM org_levels WHERE name = 'Head Office'), NULL, 1, '2026-11-06T00:00:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM org_units WHERE code = 'HQ');

INSERT INTO org_units (code, name, level_id, parent_id, active, created_at)
SELECT 'R-N', 'North', (SELECT id FROM org_levels WHERE name = 'Region'), (SELECT id FROM org_units WHERE code = 'HQ'), 1, '2026-11-06T00:00:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM org_units WHERE code = 'R-N');
INSERT INTO org_units (code, name, level_id, parent_id, active, created_at)
SELECT 'R-C', 'Central', (SELECT id FROM org_levels WHERE name = 'Region'), (SELECT id FROM org_units WHERE code = 'HQ'), 1, '2026-11-06T00:00:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM org_units WHERE code = 'R-C');
INSERT INTO org_units (code, name, level_id, parent_id, active, created_at)
SELECT 'R-S', 'South', (SELECT id FROM org_levels WHERE name = 'Region'), (SELECT id FROM org_units WHERE code = 'HQ'), 1, '2026-11-06T00:00:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM org_units WHERE code = 'R-S');

INSERT INTO org_units (code, name, level_id, parent_id, active, created_at)
SELECT 'B-HFA', 'Haifa', (SELECT id FROM org_levels WHERE name = 'Branch'), (SELECT id FROM org_units WHERE code = 'R-N'), 1, '2026-11-06T00:00:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM org_units WHERE code = 'B-HFA');
INSERT INTO org_units (code, name, level_id, parent_id, active, created_at)
SELECT 'B-TLV', 'Tel Aviv', (SELECT id FROM org_levels WHERE name = 'Branch'), (SELECT id FROM org_units WHERE code = 'R-C'), 1, '2026-11-06T00:00:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM org_units WHERE code = 'B-TLV');
INSERT INTO org_units (code, name, level_id, parent_id, active, created_at)
SELECT 'B-PTK', 'Petah Tikva', (SELECT id FROM org_levels WHERE name = 'Branch'), (SELECT id FROM org_units WHERE code = 'R-C'), 1, '2026-11-06T00:00:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM org_units WHERE code = 'B-PTK');
INSERT INTO org_units (code, name, level_id, parent_id, active, created_at)
SELECT 'B-BSV', 'Beer Sheva', (SELECT id FROM org_levels WHERE name = 'Branch'), (SELECT id FROM org_units WHERE code = 'R-S'), 1, '2026-11-06T00:00:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM org_units WHERE code = 'B-BSV');

-- ---------------------------------------------------------------- a custom role (configuration, not code)
-- Branch Manager: bottom rung of the approval ladder (position 0, below Underwriter), sees its own
-- branch and anything beneath it, can approve within a small mandate and refer upward.
INSERT INTO roles (code, label, description, scope, is_system, locked, escalation_rank, created_at)
SELECT 'BRANCH_MANAGER', 'Branch Manager', 'Approves small loans for its own branch and refers anything larger up the ladder.', 'UNIT_TREE', 0, 0, 0, '2026-11-06T00:00:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE code = 'BRANCH_MANAGER');

-- (one statement per entitlement: D1 caps the number of terms in a compound SELECT)
INSERT INTO role_entitlements (role_code, entitlement) SELECT 'BRANCH_MANAGER', 'portal.underwriter'
WHERE NOT EXISTS (SELECT 1 FROM role_entitlements WHERE role_code = 'BRANCH_MANAGER' AND entitlement = 'portal.underwriter');
INSERT INTO role_entitlements (role_code, entitlement) SELECT 'BRANCH_MANAGER', 'queue.pipeline'
WHERE NOT EXISTS (SELECT 1 FROM role_entitlements WHERE role_code = 'BRANCH_MANAGER' AND entitlement = 'queue.pipeline');
INSERT INTO role_entitlements (role_code, entitlement) SELECT 'BRANCH_MANAGER', 'dashboard.view'
WHERE NOT EXISTS (SELECT 1 FROM role_entitlements WHERE role_code = 'BRANCH_MANAGER' AND entitlement = 'dashboard.view');
INSERT INTO role_entitlements (role_code, entitlement) SELECT 'BRANCH_MANAGER', 'case.addNote'
WHERE NOT EXISTS (SELECT 1 FROM role_entitlements WHERE role_code = 'BRANCH_MANAGER' AND entitlement = 'case.addNote');
INSERT INTO role_entitlements (role_code, entitlement) SELECT 'BRANCH_MANAGER', 'case.approve'
WHERE NOT EXISTS (SELECT 1 FROM role_entitlements WHERE role_code = 'BRANCH_MANAGER' AND entitlement = 'case.approve');
INSERT INTO role_entitlements (role_code, entitlement) SELECT 'BRANCH_MANAGER', 'case.refer'
WHERE NOT EXISTS (SELECT 1 FROM role_entitlements WHERE role_code = 'BRANCH_MANAGER' AND entitlement = 'case.refer');
INSERT INTO role_entitlements (role_code, entitlement) SELECT 'BRANCH_MANAGER', 'mandates.view'
WHERE NOT EXISTS (SELECT 1 FROM role_entitlements WHERE role_code = 'BRANCH_MANAGER' AND entitlement = 'mandates.view');

-- ---------------------------------------------------------------- mandates with context
-- Branch Manager default; and a tighter Underwriter limit for cases owned by the Beer Sheva branch.
INSERT INTO mandates (role_code, org_unit_id, application_type, max_amount)
SELECT 'BRANCH_MANAGER', NULL, NULL, 25000
WHERE NOT EXISTS (SELECT 1 FROM mandates WHERE role_code = 'BRANCH_MANAGER' AND org_unit_id IS NULL AND application_type IS NULL);
INSERT INTO mandates (role_code, org_unit_id, application_type, max_amount)
SELECT 'UNDERWRITER', (SELECT id FROM org_units WHERE code = 'B-BSV'), NULL, 50000
WHERE NOT EXISTS (SELECT 1 FROM mandates WHERE role_code = 'UNDERWRITER' AND org_unit_id = (SELECT id FROM org_units WHERE code = 'B-BSV') AND application_type IS NULL);

-- ---------------------------------------------------------------- staff, one or more per role
-- National IDs 000000201-208 (login: National ID + on-screen OTP, like every other account).
INSERT INTO users (uuid, email, national_id, id_issue_date, full_name, role, org_unit_id, created_at, enabled, email_verified, otp_attempts)
SELECT lower(hex(randomblob(16))), 'banker.telaviv@digibank.com', '000000201', '2015-01-01', 'Dana Banker (Tel Aviv)', 'BANKER', (SELECT id FROM org_units WHERE code = 'B-TLV'), '2026-11-06T00:00:00.000Z', 1, 1, 0
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'banker.telaviv@digibank.com');
INSERT INTO users (uuid, email, national_id, id_issue_date, full_name, role, org_unit_id, created_at, enabled, email_verified, otp_attempts)
SELECT lower(hex(randomblob(16))), 'banker.haifa@digibank.com', '000000202', '2015-01-01', 'Yael Banker (Haifa)', 'BANKER', (SELECT id FROM org_units WHERE code = 'B-HFA'), '2026-11-06T00:00:00.000Z', 1, 1, 0
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'banker.haifa@digibank.com');
INSERT INTO users (uuid, email, national_id, id_issue_date, full_name, role, org_unit_id, created_at, enabled, email_verified, otp_attempts)
SELECT lower(hex(randomblob(16))), 'banker.beersheva@digibank.com', '000000203', '2015-01-01', 'Moti Banker (Beer Sheva)', 'BANKER', (SELECT id FROM org_units WHERE code = 'B-BSV'), '2026-11-06T00:00:00.000Z', 1, 1, 0
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'banker.beersheva@digibank.com');
INSERT INTO users (uuid, email, national_id, id_issue_date, full_name, role, org_unit_id, created_at, enabled, email_verified, otp_attempts)
SELECT lower(hex(randomblob(16))), 'manager.telaviv@digibank.com', '000000204', '2015-01-01', 'Ronit Manager (Tel Aviv)', 'BRANCH_MANAGER', (SELECT id FROM org_units WHERE code = 'B-TLV'), '2026-11-06T00:00:00.000Z', 1, 1, 0
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'manager.telaviv@digibank.com');
INSERT INTO users (uuid, email, national_id, id_issue_date, full_name, role, org_unit_id, created_at, enabled, email_verified, otp_attempts)
SELECT lower(hex(randomblob(16))), 'senior.uw@digibank.com', '000000205', '2015-01-01', 'Senior Underwriter', 'SENIOR_UNDERWRITER', NULL, '2026-11-06T00:00:00.000Z', 1, 1, 0
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'senior.uw@digibank.com');
INSERT INTO users (uuid, email, national_id, id_issue_date, full_name, role, org_unit_id, created_at, enabled, email_verified, otp_attempts)
SELECT lower(hex(randomblob(16))), 'head.lending@digibank.com', '000000206', '2015-01-01', 'Head of Lending', 'HEAD_OF_LENDING', NULL, '2026-11-06T00:00:00.000Z', 1, 1, 0
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'head.lending@digibank.com');
INSERT INTO users (uuid, email, national_id, id_issue_date, full_name, role, org_unit_id, created_at, enabled, email_verified, otp_attempts)
SELECT lower(hex(randomblob(16))), 'coo@digibank.com', '000000207', '2015-01-01', 'Chief Operating Officer', 'COO', NULL, '2026-11-06T00:00:00.000Z', 1, 1, 0
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'coo@digibank.com');
INSERT INTO users (uuid, email, national_id, id_issue_date, full_name, role, org_unit_id, created_at, enabled, email_verified, otp_attempts)
SELECT lower(hex(randomblob(16))), 'ceo@digibank.com', '000000208', '2015-01-01', 'Chief Executive Officer', 'CEO', NULL, '2026-11-06T00:00:00.000Z', 1, 1, 0
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'ceo@digibank.com');

-- The existing demo banker covers the whole Central region (Tel Aviv + Petah Tikva).
UPDATE users SET org_unit_id = (SELECT id FROM org_units WHERE code = 'R-C')
WHERE email = 'banker@digibank.com' AND org_unit_id IS NULL;

-- ---------------------------------------------------------------- case ownership
-- Spread the demo cases across branches; the older ad-hoc test cases are left unassigned, which
-- is how a customer's own digital application looks.
UPDATE loan_applications SET org_unit_id = (SELECT id FROM org_units WHERE code = 'B-TLV') WHERE application_ref IN ('DGB-2026-10001', 'DGB-2026-10003', 'DGB-2026-10009') AND org_unit_id IS NULL;
UPDATE loan_applications SET org_unit_id = (SELECT id FROM org_units WHERE code = 'B-HFA') WHERE application_ref IN ('DGB-2026-10002', 'DGB-2026-10006') AND org_unit_id IS NULL;
UPDATE loan_applications SET org_unit_id = (SELECT id FROM org_units WHERE code = 'B-PTK') WHERE application_ref IN ('DGB-2026-10004', 'DGB-2026-10008') AND org_unit_id IS NULL;
UPDATE loan_applications SET org_unit_id = (SELECT id FROM org_units WHERE code = 'B-BSV') WHERE application_ref IN ('DGB-2026-10005', 'DGB-2026-10007') AND org_unit_id IS NULL;

-- ---------------------------------------------------------------- referral chain of custody
-- DGB-2026-10004 is already REFERRED_TO_SENIOR in the pipeline data; give it a real target + history.
UPDATE loan_applications SET referred_to_role = 'SENIOR_UNDERWRITER'
WHERE application_ref = 'DGB-2026-10004' AND status = 'REFERRED_TO_SENIOR' AND referred_to_role IS NULL;

INSERT INTO case_referrals (application_ref, from_role, from_user_id, from_name, to_role, reason, created_at, resolved_at)
SELECT 'DGB-2026-10004', 'UNDERWRITER', (SELECT id FROM users WHERE email = 'underwriter@digibank.com'), 'DigiBank Underwriter',
       'SENIOR_UNDERWRITER', 'Wedding loan above my approval limit.', '2026-08-17T14:00:00.000Z', NULL
WHERE EXISTS (SELECT 1 FROM loan_applications WHERE application_ref = 'DGB-2026-10004' AND status = 'REFERRED_TO_SENIOR')
  AND NOT EXISTS (SELECT 1 FROM case_referrals WHERE application_ref = 'DGB-2026-10004');
