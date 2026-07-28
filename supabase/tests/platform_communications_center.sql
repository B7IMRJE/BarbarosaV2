begin;

select plan(12);

select has_table('public', 'communication_preferences');
select has_table('public', 'communication_push_devices');
select has_table('public', 'platform_announcements');
select has_table('public', 'platform_announcement_recipients');
select has_function('public', 'get_platform_communication_directory', array[]::text[]);
select has_function('public', 'get_my_platform_announcements', array[]::text[]);
select has_function('public', 'get_platform_announcement_history', array[]::text[]);
select has_function('public', 'mark_platform_announcement_read', array['uuid']);
select has_function('public', 'get_my_communication_preferences', array[]::text[]);
select has_function('public', 'register_communication_push_device', array['text', 'text', 'text']);
select col_is_pk('public', 'communication_preferences', 'user_id');
select col_is_pk('public', 'platform_announcement_recipients', array['announcement_id', 'user_id']);

select * from finish();
rollback;
