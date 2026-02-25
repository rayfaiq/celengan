create or replace function get_net_worth_chart_data(p_user_id uuid, p_months int)
returns table (
  month text,
  "netWorth" bigint
)
language plpgsql
as $$
begin
  return query
  with months as (
    select date_trunc('month', (current_date - (n || ' months')::interval)) as month_start
    from generate_series(0, p_months - 1) n
  ),
  latest_balances as (
    select
      date_trunc('month', bh.recorded_at) as month,
      bh.account_id,
      (array_agg(bh.balance_at_time order by bh.recorded_at desc))[1] as last_balance
    from
      balance_history bh
      join accounts a on bh.account_id = a.id
    where
      a.user_id = p_user_id
      and bh.recorded_at >= (current_date - (p_months || ' months')::interval)
    group by
      1, 2
  )
  select
    to_char(m.month_start, 'Mon YY') as month,
    coalesce(sum(lb.last_balance), 0)::bigint as "netWorth"
  from
    months m
    left join latest_balances lb on date_trunc('month', m.month_start) = lb.month
  group by
    1
  order by
    m.month_start;
end;
$$;
