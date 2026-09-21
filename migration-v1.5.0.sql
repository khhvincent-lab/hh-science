-- 在 Supabase SQL Editor 執行一次：每個補習班的獨立學生端顯示標題。
ALTER TABLE public.institutions ADD COLUMN IF NOT EXISTS brand_title text;
ALTER TABLE public.institutions DROP CONSTRAINT IF EXISTS institutions_brand_title_length;
ALTER TABLE public.institutions ADD CONSTRAINT institutions_brand_title_length CHECK (char_length(brand_title) <= 80);
