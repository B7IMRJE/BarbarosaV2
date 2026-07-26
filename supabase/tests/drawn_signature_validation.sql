begin;

select plan(3);

select has_function('public', 'is_company_drawn_signature', array['text'], 'drawn signature validator exists');
select ok(
    public.is_company_drawn_signature('{"version":1,"points":[{"x":0.1,"y":0.2},{"x":0.2,"y":0.3},{"x":0.3,"y":0.4},{"x":0.4,"y":0.5},{"x":0.5,"y":0.6}]}'),
    'five-point drawing is accepted'
);
select ok(not public.is_company_drawn_signature('Typed Name'), 'typed text is rejected');

select * from finish();
rollback;
