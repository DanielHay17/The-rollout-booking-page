-- ===========================================================================
-- Local development seed for rollout-crm.
--
--   npm run seed:local        (wrangler d1 execute rollout-crm --local --file=...)
--
-- LOCAL ONLY. Never run this with --remote: it would add 36 fictional leads to
-- the live pipeline. There are no DELETE statements in this file for exactly
-- that reason, and every INSERT is `OR IGNORE` against an explicit primary key,
-- so re-running it is a no-op rather than a pile of duplicates.
--
-- Seeded rows use a high id range so they are obvious and cannot collide with
-- real records:
--   leads        9001-9036
--   calls        9101+
--   lead_events  9201+
--   deals        9301+
--
-- EVERY PERSON, COMPANY AND PHONE NUMBER BELOW IS INVENTED. No real beehiiv
-- subscriber appears in this file. Phone numbers are drawn from 0491 570 006 -
-- 0491 570 156, the range ACMA reserves for fiction, so none of them can ring
-- an actual Australian.
--
-- The CAMPAIGNS are real: the names, ids and per-campaign spend totals come
-- from Meta ad account 1378462499217593, so a locally seeded dashboard shows
-- the same AUD 374.54 across 50 campaign-days (2026-09-12 to 2026-10-01) that
-- production does. Daily splits within each campaign are synthesised, but each
-- campaign's total, impressions and clicks match the account exactly.
--
-- Covers: all seven pipeline stages, overdue / due-today / unscheduled leads,
-- leads with and without a phone number, a legacy `never_called` row, paid and
-- organic sources, call history, two open deals, and a repeat customer with two
-- won deals (so `ltv_cents` counting a customer once is visible locally).
-- ===========================================================================


-- ------------------------------------------------------------------ leads ---
-- board_rank is 1000, 2000, 3000... within each column, matching what the
-- renumbering code produces.

INSERT OR IGNORE INTO leads (
  id, email, first_name, last_name, company, role, phone, website, source,
  subscribed_at, beehiiv_id, survey_help, survey_ai_stage, status, priority,
  segment, owner, next_action, next_action_at, board_rank, location,
  beehiiv_status, stage_changed_at
) VALUES
-- New: never contacted. Ten of them, which is what the top of the board looks
-- like after a week of ads running.
(9001, 'aidan.brophy@example.test', 'Aidan', 'Brophy', 'Brophy Earthmoving', 'Owner', '+61 491 570 006', 'brophyearthmoving.example', 'fb paid', '2026-09-30 22:41:00', 'seed_sub_001', 'Quoting takes me three nights a week', 'Not started', 'new', 'high', 'trades', NULL, NULL, NULL, 1000, 'Dubbo, NSW', 'active', '2026-09-30 22:41:00'),
(9002, 'casey.nguyen@example.test', 'Casey', 'Nguyen', 'Nguyen Dental Co', 'Practice Manager', '+61 491 570 007', NULL, 'fb paid', '2026-09-30 11:02:00', 'seed_sub_002', 'Recall reminders and no-shows', 'Tinkering with ChatGPT', 'new', 'high', 'health', NULL, NULL, NULL, 2000, 'Parramatta, NSW', 'active', '2026-09-30 11:02:00'),
(9003, 'tahlia.westbrook@example.test', 'Tahlia', 'Westbrook', 'Westbrook Signage', 'Director', '+61 491 570 008', NULL, 'ig paid', '2026-09-29 20:15:00', 'seed_sub_003', 'Writing proposals faster', 'Not started', 'new', NULL, 'trades', NULL, NULL, NULL, 3000, 'Geelong, VIC', 'active', '2026-09-29 20:15:00'),
(9004, 'rory.kavanagh@example.test', 'Rory', 'Kavanagh', 'Kavanagh Plumbing', 'Owner', '+61 491 570 009', NULL, 'fb paid', '2026-09-29 07:48:00', 'seed_sub_004', 'Answering the phone when I am under a house', 'Not started', 'new', 'high', 'trades', NULL, NULL, NULL, 4000, 'Ipswich, QLD', 'active', '2026-09-29 07:48:00'),
(9005, 'nadia.sokolov@example.test', 'Nadia', 'Sokolov', 'Sokolov Physio', 'Principal Physio', NULL, NULL, 'ig social', '2026-09-28 23:30:00', 'seed_sub_005', 'Clinical notes', 'Using it daily', 'new', NULL, 'health', NULL, NULL, NULL, 5000, 'Glenelg, SA', 'active', '2026-09-28 23:30:00'),
(9006, 'brett.ambrose@example.test', 'Brett', 'Ambrose', 'Ambrose Auto Electrics', 'Owner', '+61 491 570 010', NULL, 'fb paid', '2026-09-28 09:12:00', 'seed_sub_006', 'Chasing unpaid invoices', 'Not started', 'new', NULL, 'trades', NULL, NULL, NULL, 6000, 'Wodonga, VIC', 'active', '2026-09-28 09:12:00'),
(9007, 'imogen.teale@example.test', 'Imogen', 'Teale', 'Teale Bookkeeping', 'Director', '+61 491 570 011', 'tealebookkeeping.example', 'organic search', '2026-09-27 21:05:00', 'seed_sub_007', 'Onboarding new clients without the admin', 'Experimenting with a few tools', 'new', NULL, 'professional services', NULL, NULL, NULL, 7000, 'Hobart, TAS', 'active', '2026-09-27 21:05:00'),
(9008, 'darcy.mulvaney@example.test', 'Darcy', 'Mulvaney', 'Mulvaney Concreting', 'Owner', '+61 491 570 012', NULL, 'fb paid', '2026-09-27 05:50:00', 'seed_sub_008', 'Scheduling crews', 'Not started', 'new', NULL, 'trades', NULL, NULL, NULL, 8000, 'Bunbury, WA', 'active', '2026-09-27 05:50:00'),
(9009, 'priya.raghavan@example.test', 'Priya', 'Raghavan', 'Raghavan Migration Law', 'Principal', '+61 491 570 013', NULL, 'ig paid', '2026-09-26 22:18:00', 'seed_sub_009', 'Summarising client documents', 'Using it daily', 'new', 'high', 'professional services', NULL, NULL, NULL, 9000, 'Carlton, VIC', 'active', '2026-09-26 22:18:00'),
-- A row still stored with the pre-0003 status, so the normalisation path is
-- exercised locally and not only in tests.
(9010, 'logan.petrakis@example.test', 'Logan', 'Petrakis', 'Petrakis Pool Service', 'Owner', '+61 491 570 014', NULL, 'referral', '2026-09-26 08:44:00', 'seed_sub_010', 'Route planning', 'Not started', 'never_called', NULL, 'trades', NULL, NULL, NULL, 10000, 'Southport, QLD', 'active', '2026-09-26 08:44:00'),

-- Attempting: tried, no pickup yet. Two are overdue and one is due today.
(9011, 'marnie.hollingsworth@example.test', 'Marnie', 'Hollingsworth', 'Hollingsworth Joinery', 'Owner', '+61 491 570 015', NULL, 'fb paid', '2026-09-25 20:02:00', 'seed_sub_011', 'Quote follow-ups', 'Not started', 'attempting', 'high', 'trades', 'operator@example.test', 'Third attempt, try after 4pm', '2026-09-29', 1000, 'Ballarat, VIC', 'active', '2026-09-26 03:10:00'),
(9012, 'dev.choudhary@example.test', 'Dev', 'Choudhary', 'Choudhary Freight', 'Operations Manager', '+61 491 570 016', NULL, 'fb paid', '2026-09-25 11:27:00', 'seed_sub_012', 'Driver paperwork', 'Experimenting with a few tools', 'attempting', 'high', 'logistics', 'operator@example.test', 'Ring back, said mornings are better', '2026-10-01', 2000, 'Altona North, VIC', 'active', '2026-09-26 02:55:00'),
(9013, 'shona.delacroix@example.test', 'Shona', 'Delacroix', 'Delacroix Bridal', 'Owner', '+61 491 570 017', NULL, 'ig social', '2026-09-24 22:40:00', 'seed_sub_013', 'Appointment reminders', 'Not started', 'attempting', NULL, 'retail', 'operator@example.test', NULL, NULL, 3000, 'Subiaco, WA', 'active', '2026-09-25 04:12:00'),
(9014, 'clancy.ruthven@example.test', 'Clancy', 'Ruthven', 'Ruthven Roofing', 'Owner', '+61 491 570 018', NULL, 'fb paid', '2026-09-24 07:15:00', 'seed_sub_014', 'Insurance jobs take forever to write up', 'Not started', 'attempting', 'high', 'trades', 'operator@example.test', 'Left voicemail twice, try the office line', '2026-09-30', 4000, 'Toowoomba, QLD', 'active', '2026-09-25 01:30:00'),
(9015, 'elke.vandenberg@example.test', 'Elke', 'Vandenberg', 'Vandenberg Vet Clinic', 'Practice Owner', '+61 491 570 019', NULL, 'ig paid', '2026-09-23 21:50:00', 'seed_sub_015', 'After-hours triage calls', 'Tinkering with ChatGPT', 'attempting', NULL, 'health', 'operator@example.test', NULL, NULL, 5000, 'Mount Gambier, SA', 'active', '2026-09-24 05:00:00'),
(9016, 'jarrah.nolan.price@example.test', 'Jarrah', 'Nolan-Price', 'Nolan Price Surveying', 'Director', NULL, NULL, 'fb paid', '2026-09-23 06:33:00', 'seed_sub_016', 'Report writing', 'Not started', 'attempting', NULL, 'professional services', 'operator@example.test', NULL, NULL, 6000, 'Darwin, NT', 'active', '2026-09-24 02:20:00'),
(9017, 'bianca.castellano@example.test', 'Bianca', 'Castellano', 'Castellano Tiling', 'Owner', '+61 491 570 020', NULL, 'organic search', '2026-09-22 20:11:00', 'seed_sub_017', 'Measuring and quoting from photos', 'Not started', 'attempting', NULL, 'trades', 'operator@example.test', NULL, NULL, 7000, 'Fairfield, NSW', 'active', '2026-09-23 03:45:00'),

-- Engaged: real two-way contact, working towards a booking.
(9018, 'hamish.trenoweth@example.test', 'Hamish', 'Trenoweth', 'Trenoweth Civil', 'General Manager', '+61 491 570 021', 'trenowethcivil.example', 'fb paid', '2026-09-22 09:05:00', 'seed_sub_018', 'Tender responses', 'Experimenting with a few tools', 'engaged', 'high', 'construction', 'operator@example.test', 'Send the civil case study, then book', '2026-10-01', 1000, 'Launceston, TAS', 'active', '2026-09-27 06:00:00'),
(9019, 'yuki.tanaka.shaw@example.test', 'Yuki', 'Tanaka-Shaw', 'Shaw & Tanaka Accounting', 'Partner', '+61 491 570 022', NULL, 'ig paid', '2026-09-21 22:30:00', 'seed_sub_019', 'Client queries during tax season', 'Using it daily', 'engaged', 'high', 'professional services', 'operator@example.test', 'Confirm Thursday 10am', '2026-10-01', 2000, 'Chatswood, NSW', 'active', '2026-09-28 01:15:00'),
(9020, 'dermot.fitzsimmons@example.test', 'Dermot', 'Fitzsimmons', 'Fitzsimmons Glazing', 'Owner', '+61 491 570 023', NULL, 'fb paid', '2026-09-21 08:20:00', 'seed_sub_020', 'Measure-and-quote turnaround', 'Not started', 'engaged', NULL, 'trades', 'operator@example.test', NULL, NULL, 3000, 'Shepparton, VIC', 'active', '2026-09-26 07:40:00'),
(9021, 'anousha.farrelly@example.test', 'Anousha', 'Farrelly', 'Farrelly Interiors', 'Principal Designer', '+61 491 570 024', NULL, 'ig social', '2026-09-20 21:00:00', 'seed_sub_021', 'Mood boards and client presentations', 'Tinkering with ChatGPT', 'engaged', NULL, 'design', 'operator@example.test', 'Follow up after her Bali trip', '2026-10-06', 4000, 'North Adelaide, SA', 'active', '2026-09-25 22:10:00'),
(9022, 'kobe.wiremu@example.test', 'Kobe', 'Wiremu', 'Wiremu Scaffolding', 'Owner', '+61 491 570 025', NULL, 'fb paid', '2026-09-20 06:45:00', 'seed_sub_022', 'Safety paperwork', 'Not started', 'engaged', NULL, 'construction', 'operator@example.test', NULL, NULL, 5000, 'Logan, QLD', 'active', '2026-09-24 23:05:00'),
(9023, 'saskia.pethybridge@example.test', 'Saskia', 'Pethybridge', 'Pethybridge Optical', 'Owner', '+61 491 570 026', NULL, 'referral', '2026-09-19 22:55:00', 'seed_sub_023', 'Recalls and reminders', 'Experimenting with a few tools', 'engaged', NULL, 'health', 'operator@example.test', NULL, NULL, 6000, 'Claremont, WA', 'active', '2026-09-23 21:30:00'),

-- Booked: call is in the diary. Two carry an open deal.
(9024, 'tobias.lenehan@example.test', 'Tobias', 'Lenehan', 'Lenehan Refrigeration', 'Owner', '+61 491 570 027', NULL, 'fb paid', '2026-09-19 07:10:00', 'seed_sub_024', 'Service scheduling and callbacks', 'Experimenting with a few tools', 'booked', 'high', 'trades', 'operator@example.test', 'Discovery call Friday 2pm', '2026-10-02', 1000, 'Tamworth, NSW', 'active', '2026-09-29 04:20:00'),
(9025, 'giselle.marchetti@example.test', 'Giselle', 'Marchetti', 'Marchetti Patisserie', 'Owner', '+61 491 570 028', NULL, 'ig paid', '2026-09-18 21:35:00', 'seed_sub_025', 'Wholesale order admin', 'Not started', 'booked', NULL, 'food', 'operator@example.test', 'Call Saturday after service', '2026-10-03', 2000, 'Brunswick, VIC', 'active', '2026-09-28 22:50:00'),
(9026, 'arjun.balasubramaniam@example.test', 'Arjun', 'Balasubramaniam', 'Bala Building Group', 'Director', '+61 491 570 029', 'balabuilding.example', 'fb paid', '2026-09-18 05:25:00', 'seed_sub_026', 'Variations and site reports', 'Using it daily', 'booked', 'high', 'construction', 'operator@example.test', 'Second call with his PM', '2026-10-05', 3000, 'Rouse Hill, NSW', 'active', '2026-09-30 02:40:00'),
(9027, 'freya.oddleifson@example.test', 'Freya', 'Oddleifson', 'Oddleifson Landscapes', 'Owner', '+61 491 570 030', NULL, 'ig social', '2026-09-17 22:05:00', 'seed_sub_027', 'Design proposals', 'Tinkering with ChatGPT', 'booked', NULL, 'trades', 'operator@example.test', NULL, '2026-10-08', 4000, 'Margaret River, WA', 'active', '2026-09-27 23:15:00'),

-- Won: they bought. 9029 is a repeat customer with two deals.
(9028, 'callum.ashgrove@example.test', 'Callum', 'Ashgrove', 'Ashgrove Fabrication', 'Managing Director', '+61 491 570 031', 'ashgrovefab.example', 'fb paid', '2026-09-16 08:15:00', 'seed_sub_028', 'Shop drawings and quoting', 'Experimenting with a few tools', 'won', NULL, 'manufacturing', 'operator@example.test', NULL, NULL, 1000, 'Newcastle, NSW', 'active', '2026-09-26 02:00:00'),
(9029, 'mihika.venkatesan@example.test', 'Mihika', 'Venkatesan', 'Venkatesan Allied Health', 'Director', '+61 491 570 032', NULL, 'ig paid', '2026-09-15 21:40:00', 'seed_sub_029', 'Intake forms and triage', 'Using it daily', 'won', NULL, 'health', 'operator@example.test', NULL, NULL, 2000, 'Box Hill, VIC', 'active', '2026-09-22 01:30:00'),
(9030, 'stefan.boskovic@example.test', 'Stefan', 'Boskovic', 'Boskovic Transport', 'Owner', '+61 491 570 033', NULL, 'fb paid', '2026-09-14 07:30:00', 'seed_sub_030', 'Compliance and driver onboarding', 'Not started', 'won', NULL, 'logistics', 'operator@example.test', NULL, NULL, 3000, 'Dandenong, VIC', 'active', '2026-09-29 03:50:00'),

-- Lost: dead, with a reason recorded.
(9031, 'harriet.quartermaine@example.test', 'Harriet', 'Quartermaine', 'Quartermaine Equine', 'Owner', '+61 491 570 034', NULL, 'fb paid', '2026-09-14 22:10:00', 'seed_sub_031', 'Booking and billing', 'Not started', 'lost', NULL, 'agriculture', 'operator@example.test', NULL, NULL, 1000, 'Scone, NSW', 'active', '2026-09-23 05:20:00'),
(9032, 'omar.haddad@example.test', 'Omar', 'Haddad', 'Haddad Tyres', 'Owner', '+61 491 570 035', NULL, 'organic search', '2026-09-13 20:45:00', 'seed_sub_032', 'Stock enquiries', 'Not started', 'lost', NULL, 'retail', 'operator@example.test', NULL, NULL, 2000, 'Granville, NSW', 'inactive', '2026-09-22 04:10:00'),
(9033, 'lacey.wetherby@example.test', 'Lacey', 'Wetherby', 'Wetherby Cleaning Co', 'Director', '+61 491 570 036', NULL, 'ig social', '2026-09-13 06:20:00', 'seed_sub_033', 'Rostering', 'Tinkering with ChatGPT', 'lost', NULL, 'services', 'operator@example.test', NULL, NULL, 3000, 'Cairns, QLD', 'unsubscribed', '2026-09-21 23:40:00'),
(9034, 'jonty.pickersgill@example.test', 'Jonty', 'Pickersgill', 'Pickersgill Fencing', 'Owner', NULL, NULL, 'fb paid', '2026-09-12 21:05:00', 'seed_sub_034', 'Quoting from site photos', 'Not started', 'lost', NULL, 'trades', 'operator@example.test', NULL, NULL, 4000, 'Horsham, VIC', 'active', '2026-09-20 22:15:00'),

-- Parked: revisit later.
(9035, 'ngaire.ballantyne@example.test', 'Ngaire', 'Ballantyne', 'Ballantyne Orchards', 'Owner', '+61 491 570 037', NULL, 'ig social', '2026-09-12 08:30:00', 'seed_sub_035', 'Seasonal labour admin', 'Not started', 'parked', 'low', 'agriculture', 'operator@example.test', 'Revisit after harvest', '2026-12-01', 1000, 'Batlow, NSW', 'active', '2026-09-19 06:40:00'),
(9036, 'fletcher.oyelaran@example.test', 'Fletcher', 'Oyelaran', 'Oyelaran Smash Repairs', 'Owner', '+61 491 570 038', NULL, 'fb paid', '2026-09-12 05:55:00', 'seed_sub_036', 'Insurance assessments', 'Experimenting with a few tools', 'parked', 'low', 'trades', 'operator@example.test', 'Revisit in the new year', '2027-01-12', 2000, 'Werribee, VIC', 'active', '2026-09-18 22:25:00');

UPDATE leads SET lost_reason = 'Went with an in-house hire' WHERE id = 9031;
UPDATE leads SET lost_reason = 'No budget this quarter'     WHERE id = 9032;
UPDATE leads SET lost_reason = 'Not interested, asked not to be called' WHERE id = 9033;
UPDATE leads SET lost_reason = 'Never reachable after six attempts'     WHERE id = 9034;
UPDATE leads SET booked_at = '2026-09-29 04:20:00' WHERE id = 9024;
UPDATE leads SET booked_at = '2026-09-28 22:50:00' WHERE id = 9025;
UPDATE leads SET booked_at = '2026-09-30 02:40:00' WHERE id = 9026;
UPDATE leads SET booked_at = '2026-09-27 23:15:00' WHERE id = 9027;
UPDATE leads SET booked_at = '2026-09-24 01:10:00', won_at = '2026-09-26 02:00:00' WHERE id = 9028;
UPDATE leads SET booked_at = '2026-09-19 03:20:00', won_at = '2026-09-22 01:30:00' WHERE id = 9029;
UPDATE leads SET booked_at = '2026-09-25 05:40:00', won_at = '2026-09-29 03:50:00' WHERE id = 9030;
UPDATE leads SET lost_at = '2026-09-23 05:20:00' WHERE id = 9031;
UPDATE leads SET lost_at = '2026-09-22 04:10:00' WHERE id = 9032;
UPDATE leads SET lost_at = '2026-09-21 23:40:00' WHERE id = 9033;
UPDATE leads SET lost_at = '2026-09-20 22:15:00' WHERE id = 9034;


-- ------------------------------------------------------------------ calls ---
-- Timestamps are UTC. The operator works Sydney hours, so a working afternoon
-- lands in the 02:00-07:00 UTC band and an evening call after 14:00 UTC is
-- already the NEXT Sydney day — which is what makes the daily report's
-- timezone handling visible locally.

INSERT OR IGNORE INTO calls (id, lead_id, called_at, channel, outcome, notes, actor, duration_s) VALUES
-- Attempting: chased, no pickup.
(9101, 9011, '2026-09-26 03:10:00', 'call', 'no_answer', 'Rang twice, no answer', 'operator@example.test', 25),
(9102, 9011, '2026-09-28 05:45:00', 'call', 'voicemail', 'Left a voicemail', 'operator@example.test', 48),
(9103, 9011, '2026-09-30 06:20:00', 'call', 'no_answer', NULL, 'operator@example.test', 18),
(9104, 9012, '2026-09-26 02:55:00', 'call', 'no_answer', NULL, 'operator@example.test', 22),
(9105, 9012, '2026-09-29 04:05:00', 'sms', 'sent', 'Texted asking for a good time', 'operator@example.test', NULL),
(9106, 9013, '2026-09-25 04:12:00', 'call', 'no_answer', NULL, 'operator@example.test', 20),
(9107, 9014, '2026-09-25 01:30:00', 'call', 'voicemail', NULL, 'operator@example.test', 35),
(9108, 9014, '2026-09-28 03:50:00', 'call', 'voicemail', 'Second voicemail', 'operator@example.test', 41),
(9109, 9015, '2026-09-24 05:00:00', 'call', 'recall', 'Receptionist asked me to try next week', 'operator@example.test', 65),
(9110, 9016, '2026-09-24 02:20:00', 'email', 'sent', 'No phone number on file, emailed instead', 'operator@example.test', NULL),
(9111, 9017, '2026-09-23 03:45:00', 'call', 'no_answer', NULL, 'operator@example.test', 15),

-- Engaged: actual conversations.
(9112, 9018, '2026-09-24 06:00:00', 'call', 'connected', 'Good chat, wants the civil case study first', 'operator@example.test', 720),
(9113, 9018, '2026-09-27 06:00:00', 'email', 'sent', 'Sent the case study', 'operator@example.test', NULL),
(9114, 9019, '2026-09-25 01:15:00', 'call', 'connected', 'Keen but mid tax season', 'operator@example.test', 540),
(9115, 9019, '2026-09-28 01:15:00', 'email', 'replied', 'Replied suggesting Thursday', 'operator@example.test', NULL),
(9116, 9020, '2026-09-26 07:40:00', 'call', 'connected', 'Interested in the quoting piece', 'operator@example.test', 410),
(9117, 9021, '2026-09-25 22:10:00', 'whatsapp', 'replied', 'Away until the 5th', 'operator@example.test', NULL),
(9118, 9022, '2026-09-24 23:05:00', 'call', 'connected', 'Wants to see it on safety docs', 'operator@example.test', 380),
(9119, 9023, '2026-09-23 21:30:00', 'call', 'connected', 'Referred by her accountant', 'operator@example.test', 300),

-- Booked.
(9120, 9024, '2026-09-27 04:00:00', 'call', 'connected', NULL, 'operator@example.test', 260),
(9121, 9024, '2026-09-29 04:20:00', 'call', 'booked', 'Friday 2pm', 'operator@example.test', 180),
(9122, 9025, '2026-09-28 22:50:00', 'call', 'booked', 'Saturday after service', 'operator@example.test', 210),
(9123, 9026, '2026-09-28 02:30:00', 'call', 'connected', NULL, 'operator@example.test', 450),
(9124, 9026, '2026-09-30 02:40:00', 'meeting', 'booked', 'Bringing his PM', 'operator@example.test', 1500),
(9125, 9027, '2026-09-27 23:15:00', 'call', 'booked', NULL, 'operator@example.test', 240),

-- Won.
(9126, 9028, '2026-09-24 01:10:00', 'call', 'booked', NULL, 'operator@example.test', 300),
(9127, 9028, '2026-09-26 02:00:00', 'meeting', 'connected', 'Signed on the call', 'operator@example.test', 2700),
(9128, 9029, '2026-09-19 03:20:00', 'call', 'booked', NULL, 'operator@example.test', 280),
(9129, 9029, '2026-09-22 01:30:00', 'meeting', 'connected', 'Started with the intake pilot', 'operator@example.test', 2400),
(9130, 9030, '2026-09-25 05:40:00', 'call', 'booked', NULL, 'operator@example.test', 320),
(9131, 9030, '2026-09-29 03:50:00', 'meeting', 'connected', 'Signed, compliance first', 'operator@example.test', 3000),

-- Lost.
(9132, 9031, '2026-09-23 05:20:00', 'call', 'not_interested', 'Hiring someone internally instead', 'operator@example.test', 150),
(9133, 9032, '2026-09-22 04:10:00', 'call', 'not_interested', 'No budget until the new year', 'operator@example.test', 120),
(9134, 9033, '2026-09-21 23:40:00', 'call', 'not_interested', 'Asked not to be contacted again', 'operator@example.test', 60),
(9135, 9034, '2026-09-16 02:00:00', 'call', 'no_answer', NULL, 'operator@example.test', 20),
(9136, 9034, '2026-09-18 02:30:00', 'call', 'no_answer', NULL, 'operator@example.test', 20),
(9137, 9034, '2026-09-20 22:15:00', 'call', 'wrong_number', 'Number belongs to someone else', 'operator@example.test', 30),

-- Parked.
(9138, 9035, '2026-09-19 06:40:00', 'call', 'connected', 'Harvest until November, park it', 'operator@example.test', 240),
(9139, 9036, '2026-09-18 22:25:00', 'call', 'connected', 'Revisit in January', 'operator@example.test', 200),

-- Two calls either side of the Sydney midnight boundary (14:00 UTC on 30 Sep),
-- so the daily chart's bucketing is checkable by eye.
(9140, 9001, '2026-09-30 13:30:00', 'call', 'no_answer', 'Late arvo attempt (30 Sep Sydney)', 'operator@example.test', 15),
(9141, 9002, '2026-09-30 14:30:00', 'call', 'no_answer', 'Early morning attempt (1 Oct Sydney)', 'operator@example.test', 15);


-- ------------------------------------------------------------ lead_events ---
-- `created` for every seeded lead, generated the same way migration 0003
-- backfills the trail, so historical reports are not blind to these rows.

-- `lead_events` has no natural unique key, so these two generated inserts carry
-- their own NOT EXISTS guard rather than relying on OR IGNORE. Without it a
-- second `npm run seed:local` would double every event and quietly double the
-- dashboard's contact counts.
INSERT OR IGNORE INTO lead_events (lead_id, type, to_stage, detail, actor, created_at)
SELECT l.id, 'created', 'new', 'subscribed via ' || COALESCE(l.source, 'unknown'), 'beehiiv',
       COALESCE(l.subscribed_at, l.created_at)
  FROM leads l
 WHERE l.id BETWEEN 9001 AND 9036
   AND NOT EXISTS (
     SELECT 1 FROM lead_events e WHERE e.lead_id = l.id AND e.type = 'created'
   );

-- One `contact` event per call, so the summary's `contacted` figure (distinct
-- leads, from the audit trail) has something to count.
INSERT OR IGNORE INTO lead_events (lead_id, type, from_stage, to_stage, detail, actor, created_at)
SELECT c.lead_id, 'contact', NULL, NULL, c.channel || '/' || c.outcome, c.actor, c.called_at
  FROM calls c
 WHERE c.lead_id BETWEEN 9001 AND 9036
   AND NOT EXISTS (
     SELECT 1 FROM lead_events e
      WHERE e.lead_id = c.lead_id AND e.type = 'contact' AND e.created_at = c.called_at
   );

-- Stage changes, explicit because the flow metrics and the daily report are
-- built from these and nothing else.
INSERT OR IGNORE INTO lead_events (id, lead_id, type, from_stage, to_stage, detail, actor, created_at) VALUES
(9201, 9011, 'stage_change', 'new', 'attempting', 'contact: no_answer', 'operator@example.test', '2026-09-26 03:10:00'),
(9202, 9012, 'stage_change', 'new', 'attempting', 'contact: no_answer', 'operator@example.test', '2026-09-26 02:55:00'),
(9203, 9013, 'stage_change', 'new', 'attempting', 'contact: no_answer', 'operator@example.test', '2026-09-25 04:12:00'),
(9204, 9014, 'stage_change', 'new', 'attempting', 'contact: voicemail', 'operator@example.test', '2026-09-25 01:30:00'),
(9205, 9015, 'stage_change', 'new', 'attempting', 'contact: recall', 'operator@example.test', '2026-09-24 05:00:00'),
(9206, 9016, 'stage_change', 'new', 'attempting', 'contact: sent', 'operator@example.test', '2026-09-24 02:20:00'),
(9207, 9017, 'stage_change', 'new', 'attempting', 'contact: no_answer', 'operator@example.test', '2026-09-23 03:45:00'),

(9208, 9018, 'stage_change', 'new', 'engaged', 'contact: connected', 'operator@example.test', '2026-09-24 06:00:00'),
(9209, 9019, 'stage_change', 'new', 'engaged', 'contact: connected', 'operator@example.test', '2026-09-25 01:15:00'),
(9210, 9020, 'stage_change', 'new', 'engaged', 'contact: connected', 'operator@example.test', '2026-09-26 07:40:00'),
(9211, 9021, 'stage_change', 'new', 'engaged', 'contact: replied', 'operator@example.test', '2026-09-25 22:10:00'),
(9212, 9022, 'stage_change', 'new', 'engaged', 'contact: connected', 'operator@example.test', '2026-09-24 23:05:00'),
(9213, 9023, 'stage_change', 'new', 'engaged', 'contact: connected', 'operator@example.test', '2026-09-23 21:30:00'),

(9214, 9024, 'stage_change', 'engaged', 'booked', 'contact: booked', 'operator@example.test', '2026-09-29 04:20:00'),
(9215, 9025, 'stage_change', 'attempting', 'booked', 'contact: booked', 'operator@example.test', '2026-09-28 22:50:00'),
(9216, 9026, 'stage_change', 'engaged', 'booked', 'contact: booked', 'operator@example.test', '2026-09-30 02:40:00'),
(9217, 9027, 'stage_change', 'engaged', 'booked', 'contact: booked', 'operator@example.test', '2026-09-27 23:15:00'),

(9218, 9028, 'stage_change', 'engaged', 'booked', 'contact: booked', 'operator@example.test', '2026-09-24 01:10:00'),
(9219, 9028, 'stage_change', 'booked', 'won', 'deal #9301 won', 'operator@example.test', '2026-09-26 02:00:00'),
(9220, 9029, 'stage_change', 'engaged', 'booked', 'contact: booked', 'operator@example.test', '2026-09-19 03:20:00'),
(9221, 9029, 'stage_change', 'booked', 'won', 'deal #9302 won', 'operator@example.test', '2026-09-22 01:30:00'),
(9222, 9030, 'stage_change', 'engaged', 'booked', 'contact: booked', 'operator@example.test', '2026-09-25 05:40:00'),
(9223, 9030, 'stage_change', 'booked', 'won', 'deal #9304 won', 'operator@example.test', '2026-09-29 03:50:00'),

(9224, 9031, 'stage_change', 'engaged', 'lost', 'contact: not_interested', 'operator@example.test', '2026-09-23 05:20:00'),
(9225, 9032, 'stage_change', 'attempting', 'lost', 'contact: not_interested', 'operator@example.test', '2026-09-22 04:10:00'),
(9226, 9033, 'stage_change', 'attempting', 'lost', 'contact: not_interested', 'operator@example.test', '2026-09-21 23:40:00'),
(9227, 9034, 'stage_change', 'attempting', 'lost', 'edited', 'operator@example.test', '2026-09-20 22:15:00'),

(9228, 9035, 'stage_change', 'engaged', 'parked', 'edited', 'operator@example.test', '2026-09-19 06:40:00'),
(9229, 9036, 'stage_change', 'engaged', 'parked', 'edited', 'operator@example.test', '2026-09-18 22:25:00');


-- ------------------------------------------------------------------ deals ---
-- 9302 and 9303 are both on lead 9029: one customer, two deals. That is the
-- fixture that makes `ltv_cents` counting a repeat customer ONCE visible on the
-- local dashboard. Four won deals totalling 1,170,000c across THREE distinct
-- customers, so LTV should read 390,000c (AUD 3,900.00). If it reads 292,500c
-- it is averaging over deals instead of customers.

INSERT OR IGNORE INTO deals (id, lead_id, name, amount_cents, currency, status, closed_at, notes) VALUES
(9301, 9028, 'Quoting + shop drawings rollout', 450000, 'AUD', 'won', '2026-09-26 12:00:00', 'Paid up front'),
(9302, 9029, 'Intake automation pilot',        280000, 'AUD', 'won', '2026-09-22 12:00:00', 'Pilot, three clinics'),
(9303, 9029, 'Pilot expansion, two more sites', 120000, 'AUD', 'won', '2026-09-30 12:00:00', 'Repeat engagement'),
(9304, 9030, 'Driver onboarding rollout',      320000, 'AUD', 'won', '2026-09-29 12:00:00', NULL),
(9305, 9024, 'Service scheduling (proposed)',  380000, 'AUD', 'open', NULL, 'Quoted, awaiting the Friday call'),
(9306, 9026, 'Variations workflow (proposed)', 250000, 'AUD', 'open', NULL, 'Needs his PM across it');


-- -------------------------------------------------------------- campaigns ---
-- Real names and ids from Meta ad account 1378462499217593.

INSERT OR IGNORE INTO campaigns (id, platform, account_id, name, objective, status, first_seen_at, last_seen_at) VALUES
('120246304798030138', 'meta', '1378462499217593', 'Rollout | Xero Reel MAIN | Sep26',                      'OUTCOME_LEADS', 'ACTIVE', '2026-09-12 00:00:00', '2026-10-01 00:00:00'),
('120246304792600138', 'meta', '1378462499217593', 'Rollout | Evergreen | Real AI rollouts | Sep26 test',   'OUTCOME_LEADS', 'PAUSED', '2026-09-12 00:00:00', '2026-09-18 00:00:00'),
('120246326784160138', 'meta', '1378462499217593', 'Rollout | $85,000 story | isolated test | Sep26',       'OUTCOME_LEADS', 'PAUSED', '2026-09-14 00:00:00', '2026-09-20 00:00:00'),
('120246424846200138', 'meta', '1378462499217593', 'Rollout | Craig Reel | Sep26',                          'OUTCOME_LEADS', 'PAUSED', '2026-09-21 00:00:00', '2026-09-26 00:00:00'),
('120246304796540138', 'meta', '1378462499217593', 'Rollout | Positioning | Established owners | Sep26 test','OUTCOME_LEADS', 'PAUSED', '2026-09-12 00:00:00', '2026-09-16 00:00:00'),
('120246616976210138', 'meta', '1378462499217593', 'Rollout | Operations | Hook test | Oct26',              'OUTCOME_LEADS', 'ACTIVE', '2026-09-29 00:00:00', '2026-10-01 00:00:00'),
('120246620010150138', 'meta', '1378462499217593', 'Xero Real Footage | 1 Oct',                             'OUTCOME_LEADS', 'ACTIVE', '2026-09-30 00:00:00', '2026-10-01 00:00:00'),
-- Two that never spent, so a zero-spend campaign is on screen too.
('120246449916780138', 'meta', '1378462499217593', 'Rollout | Westpac Reel | boosted post | Sep26',         'OUTCOME_LEADS', 'PAUSED', '2026-09-20 00:00:00', '2026-09-20 00:00:00'),
('120244976077030138', 'meta', '1378462499217593', 'Rollout Test 2',                                        'OUTCOME_LEADS', 'PAUSED', '2026-09-01 00:00:00', '2026-09-01 00:00:00');


-- --------------------------------------------------------- campaign_spend ---
-- 50 campaign-days, 2026-09-12 to 2026-10-01, AUD 374.54 in total. Campaign
-- names and ids are real, and per-campaign totals match the ad account as at
-- 2026-10-01 ~11:00 UTC; the split across days within a campaign is synthesised.
--
-- The totals are a snapshot, not a fixed truth: 2026-10-01 was still in progress
-- when they were taken, so a pull 90 minutes earlier gave AUD 367.70. Do not
-- treat a mismatch against live Meta figures as a bug in the sync — compare the
-- closed days (up to 2026-09-30), which do not move.

INSERT OR IGNORE INTO campaign_spend (campaign_id, date, spend_cents, impressions, clicks, results, currency) VALUES
  ('120246304798030138', '2026-09-12', 1270, 562, 68, 2, 'AUD'),
  ('120246304798030138', '2026-09-13', 1113, 566, 63, 3, 'AUD'),
  ('120246304798030138', '2026-09-14', 1299, 458, 41, 2, 'AUD'),
  ('120246304798030138', '2026-09-15', 923, 514, 49, 2, 'AUD'),
  ('120246304798030138', '2026-09-16', 1164, 632, 43, 3, 'AUD'),
  ('120246304798030138', '2026-09-17', 1186, 537, 51, 2, 'AUD'),
  ('120246304798030138', '2026-09-18', 973, 436, 65, 2, 'AUD'),
  ('120246304798030138', '2026-09-19', 1280, 536, 47, 2, 'AUD'),
  ('120246304798030138', '2026-09-20', 1000, 416, 35, 3, 'AUD'),
  ('120246304798030138', '2026-09-21', 898, 610, 38, 1, 'AUD'),
  ('120246304798030138', '2026-09-22', 1164, 606, 58, 2, 'AUD'),
  ('120246304798030138', '2026-09-23', 742, 583, 42, 1, 'AUD'),
  ('120246304798030138', '2026-09-24', 1169, 568, 30, 2, 'AUD'),
  ('120246304798030138', '2026-09-25', 689, 686, 32, 2, 'AUD'),
  ('120246304798030138', '2026-09-26', 1237, 315, 49, 2, 'AUD'),
  ('120246304798030138', '2026-09-27', 1251, 601, 45, 3, 'AUD'),
  ('120246304798030138', '2026-09-28', 969, 487, 61, 2, 'AUD'),
  ('120246304798030138', '2026-09-29', 992, 552, 58, 1, 'AUD'),
  ('120246304798030138', '2026-09-30', 1194, 503, 63, 1, 'AUD'),
  ('120246304798030138', '2026-10-01', 819, 584, 44, 3, 'AUD'),
  ('120246304792600138', '2026-09-12', 960, 255, 9, 1, 'AUD'),
  ('120246304792600138', '2026-09-13', 702, 152, 6, 1, 'AUD'),
  ('120246304792600138', '2026-09-14', 498, 348, 10, 1, 'AUD'),
  ('120246304792600138', '2026-09-15', 448, 194, 6, 1, 'AUD'),
  ('120246304792600138', '2026-09-16', 754, 245, 7, 1, 'AUD'),
  ('120246304792600138', '2026-09-17', 831, 209, 11, 1, 'AUD'),
  ('120246304792600138', '2026-09-18', 829, 228, 8, 0, 'AUD'),
  ('120246326784160138', '2026-09-14', 469, 163, 18, 1, 'AUD'),
  ('120246326784160138', '2026-09-15', 657, 215, 19, 2, 'AUD'),
  ('120246326784160138', '2026-09-16', 744, 305, 12, 1, 'AUD'),
  ('120246326784160138', '2026-09-17', 615, 316, 18, 1, 'AUD'),
  ('120246326784160138', '2026-09-18', 745, 173, 12, 1, 'AUD'),
  ('120246326784160138', '2026-09-19', 736, 308, 24, 1, 'AUD'),
  ('120246326784160138', '2026-09-20', 743, 331, 18, 1, 'AUD'),
  ('120246424846200138', '2026-09-21', 644, 244, 10, 1, 'AUD'),
  ('120246424846200138', '2026-09-22', 756, 180, 21, 1, 'AUD'),
  ('120246424846200138', '2026-09-23', 551, 362, 22, 1, 'AUD'),
  ('120246424846200138', '2026-09-24', 482, 191, 19, 1, 'AUD'),
  ('120246424846200138', '2026-09-25', 474, 310, 20, 1, 'AUD'),
  ('120246424846200138', '2026-09-26', 693, 222, 16, 2, 'AUD'),
  ('120246304796540138', '2026-09-12', 622, 211, 7, 1, 'AUD'),
  ('120246304796540138', '2026-09-13', 304, 115, 11, 1, 'AUD'),
  ('120246304796540138', '2026-09-14', 350, 177, 5, 0, 'AUD'),
  ('120246304796540138', '2026-09-15', 341, 131, 10, 1, 'AUD'),
  ('120246304796540138', '2026-09-16', 403, 147, 6, 0, 'AUD'),
  ('120246616976210138', '2026-09-29', 119, 73, 2, 0, 'AUD'),
  ('120246616976210138', '2026-09-30', 152, 65, 2, 0, 'AUD'),
  ('120246616976210138', '2026-10-01', 175, 68, 2, 1, 'AUD'),
  ('120246620010150138', '2026-09-30', 195, 67, 4, 1, 'AUD'),
  ('120246620010150138', '2026-10-01', 130, 68, 3, 0, 'AUD');


-- ------------------------------------------------------------- sync_state ---
INSERT OR IGNORE INTO sync_state (key, value, updated_at) VALUES
('beehiiv:last_page',  '1',            '2026-10-01 00:07:00'),
('beehiiv:last_run',   'seeded-local', '2026-10-01 00:07:00'),
('meta:last_run',      'seeded-local', '2026-10-01 00:23:00'),
('meta:last_day_seen', '2026-10-01',   '2026-10-01 00:23:00');
