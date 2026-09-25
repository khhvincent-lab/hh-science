-- Match the supported configurable daily limit (1–100).
-- The quota reservation function still enforces the configured per-day limit.
ALTER TABLE public.daily_usage
  DROP CONSTRAINT daily_usage_count_check,
  ADD CONSTRAINT daily_usage_count_check CHECK (count >= 0 AND count <= 100);
