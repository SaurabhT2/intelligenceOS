-- =============================================================================
-- Migration 006 — Visual Asset Type (Cognitive Platform Evolution Program, EM-2.4)
-- =============================================================================
-- Adds 'visual_asset' to knowledge_assets.asset_type's CHECK constraint, per
-- the Platform Ownership Review's EM-2.4 verdict: a media-type distinction
-- ("this asset is an image") every future client needs identically, not a
-- BrandOS-specific taxonomy value.
--
-- No other schema change — VisualFeatureExtractor's isVisualAsset gating is
-- already content-signal-based (HEX_COLOR_RE/FONT_FAMILY_RE match count
-- against knowledge_assets.raw_content), not asset_type-based; see that
-- file's header. This migration only makes the classification value legal
-- to store, it does not change what runs.
--
-- NOT YET EXECUTED — see this repository's operational migration process
-- for 002-005; apply the same way.

alter table intelligence.knowledge_assets
  drop constraint if exists knowledge_assets_asset_type_check;

alter table intelligence.knowledge_assets
  add constraint knowledge_assets_asset_type_check
  check (asset_type in ('playbook','framework','methodology','template','reference','visual_asset'));
