-- Removes all transactional test data accumulated during Day 1-5 development/testing, leaving
-- the seed config intact: 3 staff accounts, 16 FAQs, 6 products, affordability/mandate rules,
-- branding. Safe to re-run (idempotent) -- deletes are unconditional on empty tables.

DELETE FROM underwriting_notes;
DELETE FROM notifications;
DELETE FROM product_selections;
DELETE FROM generated_documents;
DELETE FROM uploaded_documents;
DELETE FROM loan_applications;
DELETE FROM users WHERE role NOT IN ('ADMIN', 'UNDERWRITER', 'BANKER', 'SENIOR_UNDERWRITER', 'HEAD_OF_LENDING', 'COO', 'CEO');

-- Reset the seeded pre-approved offers so the fast-track flow is testable fresh by the customer
-- (000000050 was consumed during Day 2 testing).
UPDATE pre_approved_offers SET consumed = 0;
