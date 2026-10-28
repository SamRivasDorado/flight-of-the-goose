-- Recurring tasks. A task can carry a repeat rule (tasks.repeat). When a repeating task is completed,
-- the database creates the next one: same title, description, project, goal, assignee, collaborators,
-- dimension values and subtasks (unticked), due on the next date of the rule. tasks.next_task_id links
-- the finished task to the one created from it, so completing it again (after reopening) does not
-- create a second copy. Only adds; existing tasks do not repeat.
--
-- The rule (jsonb), as written by the app (src/lib/repeat.ts, which computes the same dates):
--   unit  'day' | 'weekday' | 'week' | 'month' | 'year'
--   every N (1 = every day/week/...)          days  [1..7] for weeks (1 = Monday)
--   dom   day of the month for months         from  'due' (fixed schedule) | 'done' (from completion)
--   until 'YYYY-MM-DD' (optional)             left  occurrences still to go, this one included (optional)

alter table public.tasks add column if not exists repeat jsonb;
alter table public.tasks add column if not exists next_task_id uuid references public.tasks on delete set null;
do $$ begin
  alter table public.tasks add constraint tasks_repeat_shape check (
    repeat is null or (jsonb_typeof(repeat) = 'object' and repeat->>'unit' in ('day', 'weekday', 'week', 'month', 'year')));
exception when duplicate_object then null; end $$;

-- One step of a rule after a given day.
create or replace function public.repeat_step(r jsonb, base date)
returns date language plpgsql immutable set search_path = public as $$
declare
  n int := greatest(1, coalesce((r->>'every')::int, 1));
  u text := r->>'unit';
  dow int := extract(isodow from base)::int;
  later int; first int; d date; dom int; m date;
begin
  if u = 'day' then return base + n; end if;
  if u = 'weekday' then
    d := base + 1;
    while extract(isodow from d) > 5 loop d := d + 1; end loop;
    return d;
  end if;
  if u = 'week' then
    select min(x::int) filter (where x::int > dow), min(x::int) into later, first
      from jsonb_array_elements_text(coalesce(r->'days', '[]'::jsonb)) x where x::int between 1 and 7;
    if first is null then return base + 7 * n; end if;
    if later is not null then return base + (later - dow); end if;
    return (base - (dow - 1)) + 7 * n + (first - 1);
  end if;
  if u = 'month' then
    dom := coalesce((r->>'dom')::int, extract(day from base)::int);
    m := (date_trunc('month', base) + make_interval(months => n))::date;
    return m + (least(dom, extract(day from (m + interval '1 month' - interval '1 day'))::int) - 1);
  end if;
  if u = 'year' then
    m := (date_trunc('month', base) + make_interval(years => n))::date;
    return m + (least(extract(day from base)::int, extract(day from (m + interval '1 month' - interval '1 day'))::int) - 1);
  end if;
  return null;
end $$;

-- The next due date when a task with this rule is completed on done_on; null when the series ends.
-- It is always after the completion day: on a fixed schedule, dates already past are skipped.
create or replace function public.repeat_next_due(r jsonb, due date, done_on date)
returns date language plpgsql immutable set search_path = public as $$
declare d date; i int := 0;
begin
  if r is null or (r ? 'left' and r->>'left' is not null and (r->>'left')::int <= 1) then return null; end if;
  d := repeat_step(r, case when r->>'from' = 'done' or due is null then done_on else due end);
  while d <= done_on and i < 1000 loop d := repeat_step(r, d); i := i + 1; end loop;
  if r->>'until' is not null and d > (r->>'until')::date then return null; end if;
  return d;
end $$;

-- After a repeating task is completed: create the next one (once).
create or replace function public.create_next_occurrence()
returns trigger language plpgsql security definer set search_path = public as $$
declare nd date; nid uuid; r jsonb;
begin
  if new.status <> 'done' or old.status = 'done' or new.repeat is null or new.next_task_id is not null then return new; end if;
  nd := repeat_next_due(new.repeat, new.due_date, coalesce(new.completed_at, current_date));
  if nd is null then return new; end if;
  r := case when new.repeat ? 'left' and new.repeat->>'left' is not null
         then jsonb_set(new.repeat, '{left}', to_jsonb((new.repeat->>'left')::int - 1)) else new.repeat end;
  insert into tasks (workspace_id, project_id, goal_id, title, description, due_date, status, assignee_member_id, created_by_member, repeat)
    values (new.workspace_id, new.project_id, new.goal_id, new.title, new.description, nd, 'todo', new.assignee_member_id, new.created_by_member, r)
    returning id into nid;
  insert into task_collaborators (task_id, member_id) select nid, member_id from task_collaborators where task_id = new.id;
  insert into task_values (task_id, field_id, option_id, value) select nid, field_id, option_id, value from task_values where task_id = new.id;
  insert into subtasks (task_id, title, done, position) select nid, title, false, position from subtasks where task_id = new.id;
  update tasks set next_task_id = nid where id = new.id;
  return new;
end $$;

drop trigger if exists next_occurrence on tasks;
create trigger next_occurrence after update of status on tasks
  for each row execute function create_next_occurrence();
