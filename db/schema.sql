-- Commands (teams)
create table if not exists commands (
                                        id bigserial primary key,
                                        name text not null unique,
                                        color text not null,
                                        auth_key text not null unique,
                                        created_at timestamptz not null default now()
    );

-- Points
create table if not exists points (
                                      id text primary key, -- client generated uid() (string)
                                      benchmark text not null, -- "200".."299" or "test"
                                      delay bigint not null,
                                      area bigint not null,
                                      description text not null,
                                      sender text not null, -- parsed from filename (must match command.name)
                                      file_name text not null unique,
                                      status text not null check (status in ('non-verified','verified','failed')),
    command_id bigint not null references commands(id) on delete restrict,
    created_at timestamptz not null default now()
    );

create index if not exists idx_points_created_at on points(created_at desc);
create index if not exists idx_points_benchmark on points(benchmark);
create index if not exists idx_points_command_id on points(command_id);
