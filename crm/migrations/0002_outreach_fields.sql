-- Already applied in production on 2026-09-28. Replayed only on fresh databases.
ALTER TABLE leads ADD COLUMN notes TEXT;
ALTER TABLE leads ADD COLUMN next_action TEXT;
ALTER TABLE leads ADD COLUMN research_confidence TEXT;
ALTER TABLE leads ADD COLUMN call_opener TEXT;
ALTER TABLE leads ADD COLUMN email_subject TEXT;
ALTER TABLE leads ADD COLUMN email_draft TEXT;
