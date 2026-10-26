-- When a project was finished: set when its status becomes "closed" (shown as Done),
-- cleared when it is reopened. Strategy counts finished projects per quarter with it.
alter table projects add column if not exists completed_at date;

create or replace function set_project_completed()
returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status = 'closed' then
    if tg_op = 'UPDATE' and old.status = 'closed' then
      new.completed_at := coalesce(new.completed_at, old.completed_at);   -- already done: keep its date
    else
      new.completed_at := coalesce(new.completed_at, current_date);       -- just marked done
    end if;
  else
    new.completed_at := null;                                             -- reopened
  end if;
  return new;
end $$;

drop trigger if exists project_completed on projects;
create trigger project_completed before insert or update of status, completed_at on projects
  for each row execute function set_project_completed();

-- Projects that were already closed get their end date (or creation date) as the best guess.
update projects set completed_at = coalesce(end_date, created_at::date) where status = 'closed' and completed_at is null;
