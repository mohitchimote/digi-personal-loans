-- Local-dev-only test data so the underwriter Pipeline / banker Queue / Home dashboard have
-- something to show across every status bucket. Not part of scripts/seed-generate.ts since this
-- is throwaway demo content, not the app's baseline seed set.

INSERT INTO users (uuid, email, national_id, id_issue_date, full_name, role, created_at, enabled, email_verified, otp_attempts)
VALUES
  (lower(hex(randomblob(16))), 'david.cohen.pipeline@example.com', '000000101', '2015-01-01', 'David Cohen', 'CUSTOMER', '2026-07-20T09:00:00.000Z', 1, 1, 0),
  (lower(hex(randomblob(16))), 'noa.levi.pipeline@example.com', '000000102', '2015-01-01', 'Noa Levi', 'CUSTOMER', '2026-07-22T09:00:00.000Z', 1, 1, 0),
  (lower(hex(randomblob(16))), 'avi.mizrahi.pipeline@example.com', '000000103', '2015-01-01', 'Avi Mizrahi', 'CUSTOMER', '2026-07-25T09:00:00.000Z', 1, 1, 0),
  (lower(hex(randomblob(16))), 'tamar.bendavid.pipeline@example.com', '000000104', '2015-01-01', 'Tamar Ben-David', 'CUSTOMER', '2026-07-28T09:00:00.000Z', 1, 1, 0),
  (lower(hex(randomblob(16))), 'yossi.amar.pipeline@example.com', '000000105', '2015-01-01', 'Yossi Amar', 'CUSTOMER', '2026-08-01T09:00:00.000Z', 1, 1, 0),
  (lower(hex(randomblob(16))), 'keren.tzur.pipeline@example.com', '000000106', '2015-01-01', 'Keren Tzur', 'CUSTOMER', '2026-08-03T09:00:00.000Z', 1, 1, 0),
  (lower(hex(randomblob(16))), 'eitan.azulay.pipeline@example.com', '000000107', '2015-01-01', 'Eitan Azulay', 'CUSTOMER', '2026-08-05T09:00:00.000Z', 1, 1, 0),
  (lower(hex(randomblob(16))), 'shira.benari.pipeline@example.com', '000000108', '2015-01-01', 'Shira Ben-Ari', 'CUSTOMER', '2026-08-10T09:00:00.000Z', 1, 1, 0),
  (lower(hex(randomblob(16))), 'omer.katz.pipeline@example.com', '000000109', '2015-01-01', 'Omer Katz', 'CUSTOMER', '2026-08-12T09:00:00.000Z', 1, 1, 0);

INSERT INTO loan_applications (
  application_ref, customer_id, customer_email, status, current_section, completion_percentage, application_type,
  loan_requirements_json, personal_details_json, disbursement_status, approved_amount,
  created_at, updated_at, submitted_at
)
SELECT 'DGB-2026-10001', id, email, 'SUBMITTED', 'reviewSubmit', 100, 'PERSONAL',
  '{"loanAmount":45000,"loanPurpose":"Home Improvement","loanTerm":36,"numberOfApplicants":1}',
  '{"firstName":"David","lastName":"Cohen"}',
  NULL, NULL, '2026-07-20T09:05:00.000Z', '2026-08-14T10:00:00.000Z', '2026-08-14T10:00:00.000Z'
FROM users WHERE email = 'david.cohen.pipeline@example.com';

INSERT INTO loan_applications (
  application_ref, customer_id, customer_email, status, current_section, completion_percentage, application_type,
  loan_requirements_json, personal_details_json, disbursement_status, approved_amount,
  created_at, updated_at, submitted_at
)
SELECT 'DGB-2026-10002', id, email, 'UNDER_REVIEW', 'reviewSubmit', 100, 'PERSONAL',
  '{"loanAmount":80000,"loanPurpose":"Debt Consolidation","loanTerm":48,"numberOfApplicants":1}',
  '{"firstName":"Noa","lastName":"Levi"}',
  NULL, NULL, '2026-07-22T09:05:00.000Z', '2026-08-15T11:30:00.000Z', '2026-08-15T09:00:00.000Z'
FROM users WHERE email = 'noa.levi.pipeline@example.com';

INSERT INTO loan_applications (
  application_ref, customer_id, customer_email, status, current_section, completion_percentage, application_type,
  loan_requirements_json, personal_details_json, disbursement_status, approved_amount,
  created_at, updated_at, submitted_at
)
SELECT 'DGB-2026-10003', id, email, 'CONDITIONALLY_APPROVED', 'reviewSubmit', 100, 'PERSONAL',
  '{"loanAmount":25000,"loanPurpose":"Vehicle Purchase","loanTerm":24,"numberOfApplicants":1}',
  '{"firstName":"Avi","lastName":"Mizrahi"}',
  NULL, NULL, '2026-07-25T09:05:00.000Z', '2026-08-16T09:15:00.000Z', '2026-08-13T09:00:00.000Z'
FROM users WHERE email = 'avi.mizrahi.pipeline@example.com';

INSERT INTO loan_applications (
  application_ref, customer_id, customer_email, status, current_section, completion_percentage, application_type,
  loan_requirements_json, personal_details_json, disbursement_status, approved_amount,
  created_at, updated_at, submitted_at
)
SELECT 'DGB-2026-10004', id, email, 'REFERRED_TO_SENIOR', 'reviewSubmit', 100, 'PERSONAL',
  '{"loanAmount":150000,"loanPurpose":"Wedding","loanTerm":60,"numberOfApplicants":1}',
  '{"firstName":"Tamar","lastName":"Ben-David"}',
  NULL, NULL, '2026-07-28T09:05:00.000Z', '2026-08-17T14:00:00.000Z', '2026-08-11T09:00:00.000Z'
FROM users WHERE email = 'tamar.bendavid.pipeline@example.com';

INSERT INTO loan_applications (
  application_ref, customer_id, customer_email, status, current_section, completion_percentage, application_type,
  loan_requirements_json, personal_details_json, disbursement_status, approved_amount,
  created_at, updated_at, submitted_at
)
SELECT 'DGB-2026-10005', id, email, 'APPROVED', 'reviewSubmit', 100, 'PERSONAL',
  '{"loanAmount":60000,"loanPurpose":"Medical Expenses","loanTerm":36,"numberOfApplicants":1}',
  '{"firstName":"Yossi","lastName":"Amar"}',
  NULL, 60000, '2026-08-01T09:05:00.000Z', '2026-08-17T09:00:00.000Z', '2026-08-08T09:00:00.000Z'
FROM users WHERE email = 'yossi.amar.pipeline@example.com';

INSERT INTO loan_applications (
  application_ref, customer_id, customer_email, status, current_section, completion_percentage, application_type,
  loan_requirements_json, personal_details_json, disbursement_status, approved_amount,
  created_at, updated_at, submitted_at
)
SELECT 'DGB-2026-10006', id, email, 'APPROVED', 'reviewSubmit', 100, 'PERSONAL',
  '{"loanAmount":90000,"loanPurpose":"Home Improvement","loanTerm":48,"numberOfApplicants":1}',
  '{"firstName":"Keren","lastName":"Tzur"}',
  'SECOND_CHECK_PENDING', 90000, '2026-08-03T09:05:00.000Z', '2026-08-18T09:00:00.000Z', '2026-08-06T09:00:00.000Z'
FROM users WHERE email = 'keren.tzur.pipeline@example.com';

INSERT INTO loan_applications (
  application_ref, customer_id, customer_email, status, current_section, completion_percentage, application_type,
  loan_requirements_json, personal_details_json, disbursement_status, approved_amount,
  created_at, updated_at, submitted_at
)
SELECT 'DGB-2026-10007', id, email, 'APPROVED', 'reviewSubmit', 100, 'PERSONAL',
  '{"loanAmount":35000,"loanPurpose":"Travel","loanTerm":24,"numberOfApplicants":1}',
  '{"firstName":"Eitan","lastName":"Azulay"}',
  'FUNDS_RELEASED', 35000, '2026-08-05T09:05:00.000Z', '2026-08-16T09:00:00.000Z', '2026-08-07T09:00:00.000Z'
FROM users WHERE email = 'eitan.azulay.pipeline@example.com';

INSERT INTO loan_applications (
  application_ref, customer_id, customer_email, status, current_section, completion_percentage, application_type,
  loan_requirements_json, personal_details_json, disbursement_status, approved_amount,
  created_at, updated_at, submitted_at
)
SELECT 'DGB-2026-10008', id, email, 'DRAFT', 'loanRequirements', 10, 'PERSONAL',
  '{"loanAmount":20000,"loanPurpose":"Other","loanTerm":12,"numberOfApplicants":1}',
  NULL,
  NULL, NULL, '2026-08-10T09:05:00.000Z', '2026-08-10T09:05:00.000Z', NULL
FROM users WHERE email = 'shira.benari.pipeline@example.com';

INSERT INTO loan_applications (
  application_ref, customer_id, customer_email, status, current_section, completion_percentage, application_type,
  loan_requirements_json, personal_details_json, disbursement_status, approved_amount,
  created_at, updated_at, submitted_at
)
SELECT 'DGB-2026-10009', id, email, 'IN_PROGRESS', 'documents', 70, 'PERSONAL',
  '{"loanAmount":55000,"loanPurpose":"Education","loanTerm":36,"numberOfApplicants":1}',
  '{"firstName":"Omer","lastName":"Katz"}',
  NULL, NULL, '2026-08-12T09:05:00.000Z', '2026-08-17T10:00:00.000Z', '2026-08-14T09:00:00.000Z'
FROM users WHERE email = 'omer.katz.pipeline@example.com';

-- A document request note on the IN_PROGRESS application, so Home's Action Items / Recent
-- Notifications panels have something real to show.
INSERT INTO underwriting_notes (application_ref, section, note, note_type, created_by, created_at)
VALUES (
  'DGB-2026-10009', 'documents',
  'Please upload your most recent 3 months of bank statements — the ones provided only cover 2 months.',
  'DOCUMENT_REQUEST', 'DigiBank Underwriter', '2026-08-17T10:00:00.000Z'
);
