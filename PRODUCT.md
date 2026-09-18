# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary (external):** individual and business retail-banking customers in Israel applying for a personal or business loan through DigiBank's digital channel. They authenticate with National ID + OTP (Teudat Zehut, no password — matches local banking expectations), complete a multi-step application wizard (personal details, income, outgoings, credit declarations, etc.), and track/manage approved loans afterward. Some customers are assisted by a **Banker** by phone or in-branch instead of self-registering.

**Internal:** a 5-tier underwriting/approval hierarchy (Underwriter → Senior Underwriter → Head of Lending → COO → CEO) reviewing and deciding applications against admin-configurable mandate limits; **Admins** configuring users, rules, mandates, products, branding, and email templates; **Bankers** creating and progressing applications on behalf of customers who call in or walk into a branch.

**Immediate stakeholder audience:** DigiBank Israel, who evaluated this build as a vendor capability pitch and has now selected it — see Product Purpose.

## Product Purpose

End-to-end digital loan origination: application → automated affordability/eligibility decisioning → underwriter review through a real 5-tier approval mandate hierarchy → approval → disbursement, for both personal and business loans. The project started as a capability-pitch demo for a DigiBank Israel prospect; **DigiBank has since selected this vendor/approach, and the build is now on a track toward becoming the real production system**, not a demo that stays a demo. Success means a customer can complete and track an application entirely unattended, and every internal role (underwriter, admin, banker) can do their job without a separate system.

## Positioning

A digital-first, ID+OTP-authenticated loan-origination product purpose-built for the Israeli market (Hebrew RTL, National ID/Teudat Zehut flows, NIS) with a full parallel business-loan journey and a genuine 5-tier approval mandate hierarchy designed in from the start — not a generic Western loan-origination product with a translation layer bolted on.

## Operating Context

Bilingual EN/HE UI, Hebrew rendered RTL. Customers self-serve on the web (or are assisted by a Banker by phone/in-branch); underwriters and admins work from back-office desktop portals. Currency is NIS (₪). Runs on Cloudflare Workers + D1 (migrated August 2026 from 7 Spring Boot microservices — see ARCHITECTURE.md §1.1), single Angular frontend; local dev via `wrangler dev` (worker/) + `ng serve`/`npm start` (frontend/) — see ARCHITECTURE.md §8.

## Capabilities and Constraints

- No real third-party integrations yet: OTP delivery, Open Banking (Connect Bank), and the national-ID-database lookup are all simulated client-side/in the Worker, explicitly labeled demo-only in code comments and UI copy, intended to be swapped for real providers (SMS/email, an Open Banking aggregator, a national ID API) later.
- Credit score is underwriter-only — never shown to or collected from the customer; a synthetic-but-stable score is generated client-side at submit time.
- Guarantor Details is skipped by default for every application; only becomes required when an underwriter explicitly requests one.
- Auto-approval exists only for personal loans, under an admin-configurable threshold; business applications always route to manual underwriter review (no business auto-approval threshold defined yet).
- Data model favors a JSON-blob-per-section pattern specifically so the wizard's shape can keep evolving without database migrations.
- Two now-superseded prior states worth knowing about if old references surface: the original architecture was 7 Java Spring Boot microservices (pre-Aug-2026), and hosting was GitHub Codespaces before the Cloudflare Workers migration solved the always-on-hosting problem.

## Brand Commitments

DigiBank brand: Blue `#003F79` + Yellow `#F5A200` + White, implemented entirely as CSS custom properties (admin-editable via the Branding page — no hardcoded brand hex in component styles). Typography is Inter, self-hosted via `@fontsource/inter` (no external font CDN calls). Icons are Material Icons only — no emoji.

## Evidence on Hand

Extensive existing functional and architecture documentation in this repo: `PROJECT_DOCUMENTATION.md`, `ARCHITECTURE.md`, `ARCHITECTURE_REVIEW_GAPS.md`, `PRODUCTION_READINESS.md`. A working, publicly deployed build at `https://digibank-personal-loans.mohit-chimote.workers.dev`. No real customer testimonials, case studies, or press exist — only synthetic demo personas and seeded/D1 test data; future work must not fabricate real customer evidence, benchmarks, or press.

## Product Principles

1. Every journey (personal, business, banker-assisted) must work fully unattended end-to-end — no step that only a developer could get through.
2. Simulated integrations (OTP, Open Banking, ID lookup, credit bureau/data verification, business financials) stay clearly labeled demo-only in code and UI, never presented as real.
3. Israeli-market fit is non-negotiable, not an afterthought: National ID + OTP auth, Hebrew RTL, NIS currency.
4. Internal (underwriter/admin/banker) tooling gets the same production-quality bar as the customer-facing journey, now that the build is on a track toward production rather than staying a one-off demo.
5. Prefer admin-configurability over hardcoding wherever a bank would plausibly need to change something without a redeploy (rules, mandates, products, branding, email templates).

## Accessibility & Inclusion

WCAG 2.1 AA required.
