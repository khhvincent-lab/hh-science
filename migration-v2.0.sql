-- ==========================================================
-- 解題實驗室 v2.0 / 從已安裝 v1.5.1 四級權限版本升級
-- 先備份 Supabase。此腳本不刪除學生、班級或題目。
-- ==========================================================
BEGIN;
DO $$
BEGIN
  IF to_regclass('public.admin_users') IS NULL
     OR to_regclass('public.admin_user_institutions') IS NULL
     OR to_regclass('public.admin_user_classes') IS NULL
     OR to_regclass('public.classes') IS NULL THEN
    RAISE EXCEPTION '找不到 v1.5.1 四級權限資料表，請先完成前版 SQL。';
  END IF;
END $$;
-- 保留歷史管理者身分：軟刪除只停用登入，不作物理刪除。
ALTER TABLE public.admin_users
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by text;
CREATE INDEX IF NOT EXISTS idx_admin_users_deleted_at
  ON public.admin_users(deleted_at);
-- 舊版教師如只有班級授權，先補入所屬補習班授權，再啟用新權限邏輯。
INSERT INTO public.admin_user_institutions (admin_user_id,institution_id)
SELECT DISTINCT uc.admin_user_id,c.institution_id
FROM public.admin_user_classes AS uc
JOIN public.classes AS c ON c.id=uc.class_id
WHERE c.institution_id IS NOT NULL
ON CONFLICT DO NOTHING;
-- 稽核資料留存在資料庫：不連帶刪除既有教師校正與學生題目。
CREATE TABLE IF NOT EXISTS public.admin_account_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id text NOT NULL,
  target_id text NOT NULL,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_account_audit_target
  ON public.admin_account_audit(target_id,created_at DESC);
ALTER TABLE public.admin_account_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_account_audit FROM PUBLIC;
-- service role 使用後端 API 寫入；不授權匿名或一般學生直接讀取。
COMMIT;
