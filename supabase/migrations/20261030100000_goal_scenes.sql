-- Goals get a symbol and a landscape: the icon shown next to the goal's name, and the scene it flies
-- over in the Strategy Journey (desert, mountains, coast...). Both optional: without them the app uses
-- a target and picks a different landscape for each goal. Only adds two columns.
alter table public.goals add column if not exists icon text;
alter table public.goals add column if not exists scene text;
do $$ begin
  alter table public.goals add constraint goals_scene_known check (
    scene is null or scene in ('hills', 'dunes', 'mountains', 'coast', 'forest', 'lake', 'fields', 'city'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.goals add constraint goals_icon_short check (icon is null or char_length(icon) <= 24);
exception when duplicate_object then null; end $$;
