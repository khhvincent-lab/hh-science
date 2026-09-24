alter table public.solve_accuracy_reviews drop constraint if exists solve_accuracy_reviews_verdict_check;
alter table public.solve_accuracy_reviews add constraint solve_accuracy_reviews_verdict_check check (verdict in ('ai_correct', 'ai_incorrect', 'invalid_question', 'unreviewed'));
