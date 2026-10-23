-- =====================================================================
-- WinMix — Slips & Ledger persistence (DRAFT, NOT APPLIED)
--
-- REVISION 2 (review fixes): winmix_cloud_is_operator takes a uuid argument in the live DB,
--   so every policy now calls it with (select auth.uid()); operator_id defaults to auth.uid();
--   data_version_id is ON DELETE RESTRICT so a slip never loses its data-version trace.
--
-- STATUS: DRAFT. Do NOT execute. Awaiting operator review and approval.
-- Test on a Supabase branch first, never directly on production.
--
-- DESIGN PRINCIPLES:
--  * Single operator (winmix_cloud_is_operator). No multi-user.
--  * localStorage stays the source of truth until the feature flag is ON.
--  * Stable client-generated ids for idempotent upserts.
--  * RLS: only winmix_cloud_is_operator(). No service-role access from browser.
--  * Linked to data_version_id so a slip records which data version it was
--    made on.
--  * The slip's lines are stored in a separate table (slip_lines) with a
--    foreign key to the slip. This normalises the structure and keeps each
--    row small.
--
-- ROLLBACK (at the end of this file):
--   DROP TABLE IF EXISTS winmix_slip_lines;
--   DROP TABLE IF EXISTS winmix_slips;
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. winmix_slips
--
-- One row per saved slip. The id is the client-generated stable id
-- (Slip.id in the TypeScript types). The round_name and createdAt mirror
-- the client's Slip fields. combined_prob is the product of line
-- probabilities at issue time. data_version_id records which sealed
-- data version the slip was built on, so a later audit can trace back
-- to the exact match data.
--
-- core_strategy, veto_mode, rule_version, execution_path, and
-- spec_null_reason are the audit fields from the Slip type that record
-- which strategy and rule version produced the slip.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.winmix_slips (
  id              text        PRIMARY KEY,
  operator_id     uuid        NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  data_version_id uuid        REFERENCES public.winmix_data_versions(id) ON DELETE RESTRICT,
  round_name      text        NOT NULL,
  combined_prob   double precision NOT NULL DEFAULT 0,
  core_strategy   text,
  veto_mode       text,
  rule_version    text,
  execution_path  text,
  spec_null_reason text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  synced_at       timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 2. winmix_slip_lines
--
-- One row per line in a slip. The id is the client-generated
-- `${role}-${patternId}` (SlipLine.id). The slip_id foreign key
-- cascades on delete. The league, type, code, and label are the
-- selection metadata. stability, hit_rate, and sample are the H2H
-- statistics at issue time. ft_home, ft_away, ht_home, ht_away are
-- the result entry fields (null until the operator records results).
--
-- evidence_level and core_tier are denormalised from the
-- CoreEvidenceSnapshot and CoreTier at issue time, so a ledger query
-- never has to re-derive them. core_selection_rule_version records
-- which rule version was live when the line was issued.
--
-- The JSONB columns store the richer nested objects (headToHeadRecord,
-- goalStats, htStats, topModalScores, reversalStats, goalProfile,
-- bttsRisk, coreEvidence) that are needed for audit but not for
-- querying. Keeping them as JSONB avoids a dozen narrow tables for
-- data that is always read and written together.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.winmix_slip_lines (
  id                       text        PRIMARY KEY,
  slip_id                  text        NOT NULL REFERENCES public.winmix_slips(id) ON DELETE CASCADE,
  role                     text        NOT NULL,
  fixture_label            text        NOT NULL,
  league                   text        NOT NULL,
  type                     text        NOT NULL,
  code                     text        NOT NULL,
  label                    text        NOT NULL,
  stability                double precision NOT NULL DEFAULT 0,
  hit_rate                 double precision NOT NULL DEFAULT 0,
  sample                   integer     NOT NULL DEFAULT 0,
  decision                 text,
  band                     text,
  band_hit_rate            double precision,
  band_calibrated          boolean,
  band_diagnosis           text,
  ht_home                  integer,
  ht_away                  integer,
  ft_home                  integer,
  ft_away                  integer,
  evidence_level           text,
  core_tier                text,
  core_selection_rule_version text,
  head_to_head_record      jsonb,
  goal_stats               jsonb,
  ht_stats                 jsonb,
  top_modal_scores         jsonb,
  reversal_stats           jsonb,
  goal_profile             jsonb,
  btts_risk                jsonb,
  core_evidence            jsonb,
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_slip_lines_slip_id ON public.winmix_slip_lines(slip_id);
CREATE INDEX IF NOT EXISTS idx_slips_operator_id ON public.winmix_slips(operator_id);
CREATE INDEX IF NOT EXISTS idx_slips_data_version ON public.winmix_slips(data_version_id);
CREATE INDEX IF NOT EXISTS idx_slips_created_at ON public.winmix_slips(created_at DESC);

-- ---------------------------------------------------------------------
-- 3. RLS
--
-- Only the operator can read or write. The browser client uses the
-- anon key + auth JWT; RLS checks winmix_cloud_is_operator().
-- No service-role access from the browser.
-- ---------------------------------------------------------------------

ALTER TABLE public.winmix_slips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.winmix_slip_lines ENABLE ROW LEVEL SECURITY;

-- Revoke default privileges from PUBLIC
REVOKE ALL ON public.winmix_slips FROM anon, authenticated;
REVOKE ALL ON public.winmix_slip_lines FROM anon, authenticated;

-- Grant only to authenticated (the operator signs in)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.winmix_slips TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.winmix_slip_lines TO authenticated;

-- Policy: operator can manage their own slips
CREATE POLICY "select_own_slips" ON public.winmix_slips
  FOR SELECT TO authenticated
  USING (public.winmix_cloud_is_operator((select auth.uid())));

CREATE POLICY "insert_own_slips" ON public.winmix_slips
  FOR INSERT TO authenticated
  WITH CHECK (public.winmix_cloud_is_operator((select auth.uid())));

CREATE POLICY "update_own_slips" ON public.winmix_slips
  FOR UPDATE TO authenticated
  USING (public.winmix_cloud_is_operator((select auth.uid())))
  WITH CHECK (public.winmix_cloud_is_operator((select auth.uid())));

CREATE POLICY "delete_own_slips" ON public.winmix_slips
  FOR DELETE TO authenticated
  USING (public.winmix_cloud_is_operator((select auth.uid())));

-- Policy: operator can manage slip lines (access via parent slip)
CREATE POLICY "select_own_slip_lines" ON public.winmix_slip_lines
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.winmix_slips s
    WHERE s.id = slip_id AND public.winmix_cloud_is_operator((select auth.uid()))
  ));

CREATE POLICY "insert_own_slip_lines" ON public.winmix_slip_lines
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.winmix_slips s
    WHERE s.id = slip_id AND public.winmix_cloud_is_operator((select auth.uid()))
  ));

CREATE POLICY "update_own_slip_lines" ON public.winmix_slip_lines
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.winmix_slips s
    WHERE s.id = slip_id AND public.winmix_cloud_is_operator((select auth.uid()))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.winmix_slips s
    WHERE s.id = slip_id AND public.winmix_cloud_is_operator((select auth.uid()))
  ));

CREATE POLICY "delete_own_slip_lines" ON public.winmix_slip_lines
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.winmix_slips s
    WHERE s.id = slip_id AND public.winmix_cloud_is_operator((select auth.uid()))
  ));

-- ---------------------------------------------------------------------
-- ROLLBACK (run only if the migration was applied and needs reverting)
--
-- DROP TABLE IF EXISTS public.winmix_slip_lines;
-- DROP TABLE IF EXISTS public.winmix_slips;
-- ---------------------------------------------------------------------
