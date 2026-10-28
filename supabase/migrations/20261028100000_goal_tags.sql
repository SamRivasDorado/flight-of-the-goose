-- Goal tags: a short name (up to 8 characters) and a colour for each goal, so a goal can be recognised
-- in small places (the task list, project cards, the Lens). Sub-goals use their parent's colour in the app.
-- Only adds two columns; existing goals keep working (the app suggests a short name from the title until one is saved).
alter table public.goals add column if not exists short_name text not null default '';
alter table public.goals add column if not exists color text;
do $$ begin
  alter table public.goals add constraint goals_short_name_len check (char_length(short_name) <= 8);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.goals add constraint goals_color_hex check (color is null or color ~ '^#[0-9A-Fa-f]{6}$');
exception when duplicate_object then null; end $$;
