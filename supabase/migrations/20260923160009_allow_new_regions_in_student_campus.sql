-- Legacy campus values were fixed to three regions. New student records use
-- region_id / institution_id / class_id, and campus remains a display / legacy field.
-- Permit new region labels such as 測試班 while rejecting empty or excessive values.
ALTER TABLE public.students DROP CONSTRAINT students_campus_check;
ALTER TABLE public.students ADD CONSTRAINT students_campus_check
  CHECK (char_length(btrim(campus)) BETWEEN 2 AND 80);
