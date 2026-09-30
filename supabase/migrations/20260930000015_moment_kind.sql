-- ============================================================================
-- 015 — post_kind gains 'moment' (brief M3 §1).
--
-- On its own: a new enum value cannot be used in the transaction that adds it,
-- and 016 uses it in policies and function bodies.
-- ============================================================================
alter type public.post_kind add value if not exists 'moment';
