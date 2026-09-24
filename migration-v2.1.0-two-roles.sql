-- 解題實驗室 v2.1.0 | unify admin roles
-- Execute only after v2.1.0 server is deployed: old signed role cookies are normalized.
-- Retains usernames, password hashes, active flags, grants and audit history.
BEGIN;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.admin_users WHERE role='super_admin' AND active AND deleted_at IS NULL) <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one active super administrator; migration aborted';
  END IF;
END $$;
UPDATE public.admin_users
SET role='teacher', updated_at=now()
WHERE role IN ('platform_admin','institution_admin');
ALTER TABLE public.admin_users
  DROP CONSTRAINT IF EXISTS admin_users_role_v151_check;
ALTER TABLE public.admin_users
  ADD CONSTRAINT admin_users_role_v21_check
  CHECK (role IN ('super_admin','teacher'));
COMMIT;
