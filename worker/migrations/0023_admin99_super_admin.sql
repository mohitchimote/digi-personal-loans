-- Multi-tenancy phase 5: the first platform (super) admin. Admin 99 (national ID 000000099) belongs to
-- no lender from now on and administers every lender by entering it from the platform console.
-- DIGI keeps its own lender admins (for example the seeded admin 000000015). A no-op where admin 99
-- does not exist.
UPDATE `users` SET `role` = 'SUPER_ADMIN', `lender_id` = NULL, `org_unit_id` = NULL, `sessions_revoked_at` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE `national_id` = '000000099' AND `lender_id` = 1 AND `role` = 'ADMIN';
