-- "No goose flies alone": offers of help on someone's overdue task.
-- Anyone who can see the task sees the offers (they show as companion geese); everyone but
-- guests can offer, in their own name, to the task's assignee; the person helped accepts or
-- declines; the helper can withdraw. Accepting also makes the helper a collaborator (done by
-- the app, under the existing collaborator rules).
create table if not exists help_offers (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references workspaces on delete cascade,
  task_id           uuid not null references tasks on delete cascade,
  helper_member_id  uuid not null references workspace_members on delete cascade,
  helped_member_id  uuid not null references workspace_members on delete cascade,
  status            text not null default 'offered' check (status in ('offered', 'accepted', 'declined', 'withdrawn')),
  message           text not null default '' check (length(message) <= 500),
  created_at        timestamptz not null default now(),
  answered_at       timestamptz,
  check (helper_member_id <> helped_member_id)
);
create index if not exists help_offers_task_idx on help_offers (task_id);
create index if not exists help_offers_ws_idx on help_offers (workspace_id, created_at);
-- one open offer per helper and task
create unique index if not exists help_offers_open_idx on help_offers (task_id, helper_member_id) where status in ('offered', 'accepted');

alter table help_offers enable row level security;
grant select, insert, update on help_offers to authenticated;

drop policy if exists help_read on help_offers;
create policy help_read on help_offers for select using (can_see_task(task_id));

drop policy if exists help_insert on help_offers;
create policy help_insert on help_offers for insert with check (
  can_edit(workspace_id)
  and helper_member_id = my_member_id(workspace_id)
  and status = 'offered'
  and ws_of_task(task_id) = workspace_id and can_see_task(task_id)
  and helped_member_id = (select assignee_member_id from tasks where id = task_id));

-- the person helped answers; the helper can withdraw (who may change what is checked by the trigger)
drop policy if exists help_update on help_offers;
create policy help_update on help_offers for update
  using (helped_member_id = my_member_id(workspace_id) or helper_member_id = my_member_id(workspace_id))
  with check (helped_member_id = my_member_id(workspace_id) or helper_member_id = my_member_id(workspace_id));

create or replace function help_offer_rules()
returns trigger
language plpgsql set search_path = public as $$
begin
  if new.task_id <> old.task_id or new.helper_member_id <> old.helper_member_id or new.helped_member_id <> old.helped_member_id
     or new.workspace_id <> old.workspace_id then
    raise exception 'An offer of help cannot be moved to another task or person.';
  end if;
  if new.status <> old.status then
    if new.status in ('accepted', 'declined') and old.helped_member_id is distinct from my_member_id(old.workspace_id) then
      raise exception 'Only the person being helped can accept or decline.';
    end if;
    if new.status = 'withdrawn' and old.helper_member_id is distinct from my_member_id(old.workspace_id) then
      raise exception 'Only the helper can withdraw an offer.';
    end if;
    new.answered_at := now();
  end if;
  return new;
end $$;

drop trigger if exists help_offer_rules on help_offers;
create trigger help_offer_rules before update on help_offers for each row execute function help_offer_rules();
