-- ZyAI — saved chats. One conversation per thread, its messages in
-- order. Each user only ever reads their own conversations (enforced in the
-- API). Only the visible text is stored, not the model's internal tool calls.
--
-- Run by hand in the Supabase SQL editor, on dev and on prod, BEFORE
-- deploying the matching code. Safe to re-run.

create table if not exists ai_conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid        not null references users(id) on delete cascade,
  title       text        not null default 'New chat',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists ai_conversations_user_idx on ai_conversations (user_id, updated_at desc);

create table if not exists ai_messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid        not null references ai_conversations(id) on delete cascade,
  role             text        not null check (role in ('user', 'assistant')),
  content          text        not null default '',
  sources          jsonb       not null default '[]'::jsonb,  -- web links used in the answer
  created_at       timestamptz not null default now()
);

create index if not exists ai_messages_conversation_idx on ai_messages (conversation_id, created_at);

-- Names / types / sizes of files attached to a message (the files themselves aren't stored)
alter table ai_messages add column if not exists attachments jsonb not null default '[]'::jsonb;

-- Which mode answered an assistant message: 'fast' or 'smart' (null on user messages)
alter table ai_messages add column if not exists mode text check (mode in ('fast', 'smart'));
