// Row shapes as stored in the database (supabase/migrations).

export type Access = 'admin' | 'manager' | 'member' | 'guest';

export interface WorkspaceRef {
  workspace_id: string;
  workspace_name: string;
  member_id: string;
  access: Access;
}

export interface Member {
  id: string;
  workspace_id: string;
  user_id: string | null;
  email: string;
  display_name: string;
  title: string;
  access: Access;
  status: 'invited' | 'active';
  color: string;
}

export interface Project {
  id: string;
  workspace_id: string;
  name: string;
  color: string;
  icon: string;
  image_path: string | null;
  image_fit: 'fit' | 'fill';
  created_at: string;
  kind: 'fixed' | 'ongoing';
  status: 'active' | 'paused' | 'closed';
  start_date: string | null;
  end_date: string | null;
  owner_member_id: string | null;
}

export interface Task {
  id: string;
  workspace_id: string;
  project_id: string | null;
  goal_id: string | null;
  title: string;
  description: string;
  due_date: string | null;
  status: 'todo' | 'doing' | 'done';
  completed_at: string | null;
  hours: number | null;
  assignee_member_id: string | null;
  created_by_member: string | null;
  created_at: string;
  /** Set when the task was made from a notebook line. */
  source_note_id?: string | null;
  source_line?: number | null;
}

export interface Subtask {
  id: string;
  task_id: string;
  title: string;
  done: boolean;
  position: number;
}

/** A task together with its subtasks and collaborators, as the screens use it. */
export interface TaskFull extends Task {
  subtasks: Subtask[];
  collaborator_ids: string[];
}

export interface GoalRef {
  id: string;
  title: string;
  parent_id: string | null;
}

export const STATUSES: { id: Task['status']; label: string; color: string }[] = [
  { id: 'todo', label: 'To do', color: '#7C8577' },
  { id: 'doing', label: 'In progress', color: '#E9B93A' },
  { id: 'done', label: 'Done', color: '#6B9160' },
];

export const ACCESS_LABEL: Record<Access, string> = {
  admin: 'Admin', manager: 'Manager', member: 'Member', guest: 'Guest',
};

export const canManage = (a: Access) => a === 'admin' || a === 'manager';
export const canEdit = (a: Access) => a !== 'guest';

/** A project with the people, teams and goals linked to it. */
export interface ProjectFull extends Project {
  member_ids: string[];
  team_ids: string[];
  goal_ids: string[];
}

export type NoteKind = 'note' | 'meeting' | 'decision';
export const NOTE_KINDS: { id: NoteKind; label: string }[] = [
  { id: 'note', label: 'Note' }, { id: 'meeting', label: 'Meeting' }, { id: 'decision', label: 'Decision' },
];

export interface Note {
  id: string;
  workspace_id: string;
  project_id: string;
  entry_date: string;
  kind: NoteKind;
  body: string;
  created_by_member: string | null;
  created_at: string;
}

export interface TeamRef {
  id: string;
  name: string;
  color: string;
}
