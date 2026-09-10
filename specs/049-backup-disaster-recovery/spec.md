# Feature Specification: Backup & Disaster Recovery

**Feature Branch**: `049-backup-disaster-recovery`

**Created**: 2026-09-05

**Status**: Draft

**Input**: User description: "If the system goes down or the database disappears, we need a backup plan. There is no backup plan yet. Protect Vault OS and Cosmo OS operational data with vendor rewind for recent mistakes, independent copies if the primary database host is gone, a restore runbook, and later file/secret recovery."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Independent copies exist without anyone remembering to click (Priority: P1)

An operations owner does not take a manual copy each night. The three live systems — **Vault OS**, **Cosmo OS production**, and **Cosmo OS development** — each get a complete independent copy on a schedule. That copy lives **outside** the same vendor and account as the live database. Production copies are never skipped. The owner can see when the last successful copy finished and how old it is.

**Why this priority**: If the primary database host is deleted, locked, or the region is gone, vendor rewind inside that host does not help. Independent copies are the only recovery path. Without this story, the feature is not a disaster plan.

**Independent Test**: Wait for one scheduled cycle (or trigger it once). Confirm a dated copy exists for each of the three systems in the independent store, and that the recorded age of the production copy is within the agreed recovery-point window.

**Acceptance Scenarios**:

1. **Given** all three systems are reachable, **When** the scheduled copy job runs, **Then** a complete copy is stored for Vault OS, Cosmo OS production, and Cosmo OS development, each labelled with system name and time taken.
2. **Given** a successful production copy, **When** an operator checks backup status, **Then** they see last-success time and that the copy is no older than 24 hours.
3. **Given** Cosmo OS development copy fails but production succeeds, **When** the job finishes, **Then** production copy is still retained and the development failure is reported separately (one failure does not wipe or skip the others).
4. **Given** copies older than the retention policy, **When** the job applies retention, **Then** expired copies are removed and the retained set still includes recent daily copies plus older weekly and monthly copies as specified in FR-006.

---

### User Story 2 - Undo recent accidental data loss without a full rebuild (Priority: P1)

A staff member (or a bad change) deletes or corrupts yesterday's orders, contacts, or settings. The primary database host still exists. An operations owner uses the host's built-in rewind / snapshot capability to return that system to a known-good point **before** the damage, after confirming the target time. They do this from a written procedure, not memory.

**Why this priority**: Most real incidents are "we deleted the wrong rows" or "a change went bad," not "the vendor vanished." Fast rewind is how the business gets back the same day without restoring from independent copies.

**Independent Test**: On a non-production system (or a disposable copy of it), delete a known row, rewind to before the delete, confirm the row is back and later intentional work after that point is gone (as rewind implies).

**Acceptance Scenarios**:

1. **Given** the primary host still exists and the damage is inside the host's rewind window, **When** an operator follows the rewind procedure with a confirmed timestamp, **Then** the chosen system returns to that point and the business can continue on that system.
2. **Given** production is the target, **When** rewind is requested, **Then** it does not proceed until an in-the-moment confirmation from an authorised person (prior approval of a similar restore does not count).
3. **Given** the operator is unsure of the exact time of damage, **When** they follow the procedure, **Then** they can inspect or preview a historical point before committing rewind of the live system.
4. **Given** rewind is not available (window expired or host gone), **When** the operator consults the runbook, **Then** it directs them to User Story 3 (independent-copy restore) instead of failing silently.

---

### User Story 3 - Rebuild from independent copies when the database host is gone (Priority: P1)

The live database is unreachable or destroyed. Application hosting may also be down. An operations owner uses only the runbook, the independent copies, and the source-code repository to stand up Cosmo OS production (and Vault OS if that copy is needed) on a new database host, point the application at it, and confirm core operations work (login, recent orders visible, settings present).

**Why this priority**: This is the scenario the user named: system down or database disappeared. Vendor rewind cannot be used. This story is the actual disaster recovery path.

**Independent Test**: Restore the latest production independent copy onto a **new empty** database host (not the live production host). Compare order counts and a sample of recent orders against a known baseline or a read-only check taken before the test. Do not overwrite live production during the test.

**Acceptance Scenarios**:

1. **Given** a valid independent production copy and a new empty database host, **When** an operator follows the restore procedure, **Then** the restored system contains the data from that copy and the application can connect to it in a non-live test environment.
2. **Given** live production is still healthy, **When** a restore drill runs, **Then** live production is not overwritten.
3. **Given** the copy is encrypted or access-controlled, **When** an unauthorised person obtains the file, **Then** they cannot read customer or order data without the authorised credentials.
4. **Given** restore of live production is required for a real incident, **When** the operator starts cut-over, **Then** the same in-the-moment confirmation rule as US2 applies.

---

### User Story 4 - Operators notice a missed copy the same day (Priority: P1)

The scheduled copy fails (credentials expired, host unreachable, storage full). Nobody is watching the job by habit. The operations owner receives a clear failure notice the same calendar day and can tell which of the three systems failed.

**Why this priority**: An unmonitored copy job will silently stop. Then the disaster happens and the last good copy is weeks old. Detection is part of the backup, not an extra.

**Independent Test**: Force a failure (invalid target or unreachable system) on a non-production copy path; confirm a failure notice is produced and names the system.

**Acceptance Scenarios**:

1. **Given** a scheduled copy fails for one system, **When** the job ends, **Then** an authorised operator is notified within 24 hours with system name and that it failed.
2. **Given** all three copies succeed, **When** the job ends, **Then** no failure alarm is raised (success may be logged silently).
3. **Given** copies have not succeeded for production for more than 24 hours, **When** an operator checks status, **Then** the gap is obvious (stale last-success time or explicit "overdue" state).

---

### User Story 5 - Written restore path anyone on the ops roster can follow (Priority: P1)

A second operator, not the person who set backups up, can recover using a short runbook: when to rewind vs restore from independent copy, confirmation rules, order of steps, who to tell, and how to verify the business is back (recent orders, logins, that the other product line was not mixed up — Vault vs Cosmo).

**Why this priority**: Backups without a usable procedure fail at 2 a.m. The runbook is the deliverable staff will actually use.

**Independent Test**: A reviewer who did not write the automation reads only the runbook and explains the production-restore path correctly, including the confirmation gate and the "do not restore onto live production during a drill" rule.

**Acceptance Scenarios**:

1. **Given** the runbook, **When** an operator chooses a scenario (accidental delete vs host gone vs application host down only), **Then** the runbook states which path to use and what is out of scope (finance system, store platform, login vendor).
2. **Given** application hosting is down but the database is healthy, **When** the operator follows the runbook, **Then** they redeploy the application from the source repository and existing configuration — they do not restore the database.
3. **Given** Vault OS and Cosmo OS production copies, **When** restoring, **Then** the runbook forbids restoring one product's copy onto the other product's live system.

---

### User Story 6 - Uploaded files and media survive a store outage (Priority: P2)

Receipts, logos, academy media, and other uploaded files live in file stores, not only in the database. If that file store is wiped, database rows still point at missing files. An operations owner has independent copies of those files (or a documented vendor recovery for that store) so a database restore is not a silent "data is back, pictures are gone."

**Why this priority**: Operational truth is in the database; files are secondary but real (receipts, logos). Ship after database copies exist.

**Independent Test**: Upload a test file, run the file-copy process, delete or hide the original, restore from the independent file copy, confirm the file is readable again.

**Acceptance Scenarios**:

1. **Given** files stored for book-note receipts, admin uploads, and academy media, **When** the file-copy process runs, **Then** those files exist in an independent store or the runbook names the vendor recovery that covers them.
2. **Given** a database restore to an earlier time, **When** files are also restored, **Then** operators have a documented rule for mismatch (file newer than database row, or row without file).

---

### User Story 7 - App can be stood up without tribal knowledge of secrets (Priority: P2)

The application host project is deleted. Database copies exist. An operations owner still needs login-vendor settings, database addresses, and other environment values. Those values live in a dedicated secret inventory (not in the source repository). The runbook lists which values are required to bring Cosmo OS production and Vault OS back.

**Why this priority**: Independent database copies are useless if nobody can re-attach the application. This is configuration recovery, not a new product feature.

**Independent Test**: Using only the secret inventory checklist (values redacted in review), confirm every required production setting named in the runbook is present in the inventory.

**Acceptance Scenarios**:

1. **Given** the secret inventory, **When** an operator rebuilds application hosting, **Then** they can populate all required production settings without reading another person's laptop.
2. **Given** the source repository, **When** searched, **Then** it does not contain production secrets.

---

### User Story 8 - Prove restore works on a calendar, not only in theory (Priority: P2)

At least once per quarter, operations restore a production copy onto a throwaway host, tick a short verification list (row counts, sample order, Vault/Cosmo not crossed), record the date, and discard the throwaway host. The feature is not "done" until the first drill has been recorded.

**Why this priority**: Untested copies fail when you need them. Drill is how the success criteria become real. It is P2 so the first automated copies can ship, then the first drill must land before calling the programme complete.

**Independent Test**: Complete one recorded drill with date, operator, copy used, verification results, and confirmation that live production was untouched.

**Acceptance Scenarios**:

1. **Given** at least one successful independent production copy, **When** the quarterly drill runs, **Then** restore onto a non-live host succeeds and results are written down.
2. **Given** the previous drill is more than 90 days ago, **When** an operator checks status, **Then** the overdue drill is visible in the same place they check backup age.

---

### Edge Cases

- Copy job overlaps the next schedule (slow dump): the running job MUST finish or fail cleanly; a second job MUST NOT corrupt the copy in progress.
- Database is mid-write during copy: the copy MUST still be restorable (consistent snapshot of that moment); a torn/unusable copy MUST be treated as failure and alerted.
- Rewind window expired (damage older than host history): runbook MUST send the operator to independent-copy restore, not a partial rewind.
- Independent copy is itself corrupt: retain previous retained copies so the operator can try the prior day's copy; alert on the corrupt run.
- Operator restores the wrong product (Vault copy onto Cosmo, or the reverse): runbook and restore procedure MUST require an explicit system identity check before apply.
- Live production restore during a drill: MUST be blocked by procedure; drill target is always a new/empty host.
- Application down, database healthy: restore MUST NOT be the first step; redeploy only.
- Schema on the copy is older than current application: runbook MUST say how to detect mismatch and stop before serving live traffic.
- Storage for independent copies is unavailable: treat as copy failure; alert; do not delete the last good copies as part of retention that same day.
- Authorised operator unavailable: runbook names at least two people (or roles) who may confirm a production restore.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The organisation MUST keep **independent recoverable copies** of Vault OS, Cosmo OS production, and Cosmo OS development. "Independent" means the copies remain usable if the primary database host account, project, or region is gone.
- **FR-002**: Cosmo OS production MUST have a successful independent copy at least once per calendar day. Vault OS MUST match that frequency. Cosmo OS development MUST be copied on the same cadence unless a documented exception is approved.
- **FR-003**: Operators MUST be able to read **last successful copy time** per system without opening vendor consoles ad hoc (a status view, log, or notice is enough; no customer-facing screen is required).
- **FR-004**: A failed or overdue production copy MUST notify an authorised operator within 24 hours, naming the system.
- **FR-005**: Independent copies MUST be access-controlled and unreadable to unauthorised people (encryption and/or storage permissions). Copies MUST NOT be committed to the source repository.
- **FR-006**: Retention MUST keep at least **7 daily**, **4 weekly**, and **12 monthly** independent copies for Cosmo OS production and for Vault OS. Development copies MAY use a shorter policy (minimum 7 daily).
- **FR-007**: The primary database host's **rewind / snapshot** capability MUST be enabled at the maximum history the current paid plan allows, for production and Vault OS, and the runbook MUST say how to use it.
- **FR-008**: Production rewind and production restore from independent copies MUST require **in-the-moment confirmation** from an authorised person. Earlier approval of a similar action MUST NOT skip this gate.
- **FR-009**: A restore **drill** MUST always target a non-live host. The procedure MUST refuse to use live production as the drill destination.
- **FR-010**: A written **runbook** MUST cover: (a) application host down, database healthy; (b) accidental data loss, host still up; (c) database host gone; (d) confirmation rules; (e) Vault vs Cosmo identity check; (f) how to verify recovery; (g) who to notify.
- **FR-011**: After any restore, operators MUST be able to verify recovery with a short checklist: can authorised users sign in, do recent orders (or Vault equivalent records) appear, were the two product lines not swapped, does the application schema match the restored data closely enough to serve traffic.
- **FR-012**: Application source code is recovered from the existing source repository; this feature MUST NOT add a second code-backup scheme.
- **FR-013**: Restore of one product MUST NOT be applied onto the other product's live system (Vault copy ↛ Cosmo live, Cosmo copy ↛ Vault live).
- **FR-014**: Finance system (ERPNext), online store (Shopify), and login vendor (Auth0) data are **out of this feature's copy jobs**. The runbook MUST state that those vendors' own recovery is used, and that Cosmo/Vault operational data is not reconstructed from them as the primary path.
- **FR-015**: v1 MUST deliver FR-001 through FR-014 (database copies, rewind configuration, alerts, runbook, confirmation gate). Uploaded-file copies (US6) and secret inventory (US7) MUST be in the runbook as explicit follow-through if they do not ship in the first delivery.
- **FR-016**: At least one recorded restore drill (US8) MUST complete before the programme is marked complete; thereafter a drill MUST run at least every 90 days.
- **FR-017**: Operators MUST be able to restore a chosen independent copy onto a new empty database host using only the runbook and authorised credentials.
- **FR-018**: Each independent copy MUST be a consistent, restorable image of that system as of the copy time. A copy that cannot be restored MUST be treated as a failed copy (FR-004), not as a successful backup.

### Key Entities

- **Protected system**: One of Vault OS, Cosmo OS production, or Cosmo OS development. Identity of the system is a required field on every copy and restore.
- **Independent copy**: A dated, complete, restorable image of one protected system stored outside the primary database host. Attributes: system, taken-at, size/status, retention class (daily / weekly / monthly), success/failure.
- **Host rewind point**: A moment inside the primary host's history window that can be restored without using an independent copy.
- **Restore event**: Who requested, which system, rewind vs independent copy, confirmation recorded, target host (live vs drill), verification outcome.
- **Runbook**: The operator-facing procedure; versioned with the feature. Not customer-facing software.
- **Secret inventory**: Named list of required application settings for rebuild; values stored outside the source repository.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On at least 30 consecutive calendar days after go-live, Cosmo OS production has an independent copy no older than 24 hours at the end of each day (allow one documented maintenance miss).
- **SC-002**: A designated operator who did not set up the job can restore the latest production independent copy onto a **new empty** host and complete the verification checklist in **one working day**, without using the original database host.
- **SC-003**: In an acceptance test, accidental deletion of a known record on a non-production system is undone via host rewind within **30 minutes** of starting the procedure (inside the rewind window).
- **SC-004**: 100% of simulated production-copy failures in acceptance testing produce an operator-visible failure notice within 24 hours that names the system.
- **SC-005**: Two reviewers independently follow the runbook for "database host gone" and both choose independent-copy restore (not rewind) and both refuse to target live production for a drill.
- **SC-006**: Zero production secrets appear in the source repository in a scan at acceptance.
- **SC-007**: First restore drill is recorded with date, operator, copy used, and "live production untouched"; subsequent drills occur within 90 days of the previous one.

## Assumptions

- Recovery-point goal for independent copies is **24 hours** for production and Vault OS. Host rewind covers more recent mistakes when the host still exists.
- Recovery-time goal for a full rebuild from independent copies (new database host + application pointed at it) is **one working day**, given the runbook and two authorised people.
- The three named systems are the only databases this feature must copy. No additional reporting replicas are in scope.
- Application hosting is stateless: if the app is down and the database is healthy, recovery is redeploy plus existing settings, not a database restore.
- Uploaded files and secret inventory may trail the first delivery but remain required before the programme is marked complete (FR-015, US6, US7, US8).
- ERPNext, Shopify, Auth0, and image/CDN vendors keep their own recovery; this feature does not duplicate them.
- Production restore stays under the existing production-safety rule: explicit in-the-moment confirmation, never assumed from an earlier yes.
- Hot standby (a second live database always running) is not required for v1; daily independent copies plus host rewind are enough for the stated goals.
- Operators in scope are company admins / technical owners, not store staff or riders. No in-app customer UI.

## Dependencies

- Access to take a complete copy of each of the three live databases, including a direct (non-pooled) connection where that is required for a consistent copy.
- An independent storage location under a different vendor or account than the live database host.
- Existing source repository and application hosting, to redeploy the app after a database recovery.
- Existing production-change confirmation practice (constitution: no production database apply/restore without in-the-moment confirmation).
- Named operations roster of at least two people who may confirm production restore.

## Out of Scope (v1)

- A customer- or staff-facing "Backup" screen in Cosmo OS / Vault OS (status for operators may be logs, notices, or a simple internal check — not a product module).
- Continuous replication or an always-on second live database (hot standby).
- Copying or restoring ERPNext, Shopify, Auth0, or CDN/media vendor accounts as part of this job.
- Reconstructing Cosmo/Vault operational data from ERPNext invoices as the primary recovery method.
- Backing up git / source code (already hosted).
- Point-in-time independent copies more frequent than daily (e.g. hourly dumps).
- Automatic unattended restore onto live production.
- Cross-region active-active application hosting beyond what the current application host already provides.
