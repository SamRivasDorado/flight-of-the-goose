-- Solo mode: a workspace setting for people who work on their own.
-- When on, the app hides everything about teams and other people.
-- Only admins can change it (the existing ws_update rule), and the app only
-- offers it while the admin is the only person in the workspace.
alter table workspaces add column if not exists solo boolean not null default false;
