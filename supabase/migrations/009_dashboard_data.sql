create or replace function get_dashboard_data(p_user_id uuid)
returns jsonb
language plpgsql
as $$
declare
  v_settings record;
  v_chart_data jsonb;
  v_accounts jsonb;
  v_account_deltas jsonb;
  v_net_worth bigint;
  v_spending_total bigint;
  v_income_total bigint;
  v_net_transaction_spending bigint;
  v_prev_total bigint;
  v_total_delta bigint;
  v_unaccounted_spending bigint;
  v_transactions_current_month jsonb;
begin
  -- Settings (with auto-creation)
  select * into v_settings from public.settings where user_id = p_user_id;
  if v_settings is null then
    insert into public.settings (user_id, monthly_income, goal_target, goal_target_date)
    values (p_user_id, 20000000, 100000000, '2027-11-01')
    returning * into v_settings;
  end if;

  -- Chart Data (using existing function)
  select jsonb_agg(chart_data) into v_chart_data from (
    select * from get_net_worth_chart_data(p_user_id, 6)
  ) chart_data;

  -- Accounts
  select jsonb_agg(ac) into v_accounts from (select * from accounts where user_id = p_user_id) ac;

  -- Net Worth (sum of current balances)
  select coalesce(sum(balance), 0) into v_net_worth from accounts where user_id = p_user_id;

  -- Current Month's Transactions
  select
    coalesce(sum(case when type = 'spending' then amount else 0 end), 0),
    coalesce(sum(case when type = 'income' then amount else 0 end), 0)
  into v_spending_total, v_income_total
  from transactions
  where user_id = p_user_id and date >= date_trunc('month', current_date);

  v_net_transaction_spending := v_spending_total - v_income_total;
  
  select jsonb_agg(tx) into v_transactions_current_month from (
    select * from transactions
    where user_id = p_user_id and date >= date_trunc('month', current_date)
    order by date desc
  ) tx;

  -- Account Deltas
  with ranked_snapshots as (
    select
      b.account_id,
      b.balance_at_time,
      b.recorded_at,
      coalesce(lag(b.balance_at_time) over (partition by b.account_id order by b.recorded_at), 0) as previous_balance,
      coalesce(lag(b.recorded_at) over (partition by b.account_id order by b.recorded_at), '1970-01-01'::timestamptz) as prev_recorded_at,
      row_number() over (partition by b.account_id order by b.recorded_at desc) as rn
    from balance_history b
    join accounts a on b.account_id = a.id
    where a.user_id = p_user_id
  ),
  latest_snapshots as (
    select * from ranked_snapshots where rn = 1
  ),
  deltas as (
    select
      ls.account_id as "accountId",
      a.name as "accountName",
      (ls.balance_at_time - ls.previous_balance) as "rawDelta",
      coalesce(t.linked_net, 0) as "linkedNet",
      (ls.balance_at_time - ls.previous_balance - coalesce(t.linked_net, 0)) as "unaccounted",
      ls.recorded_at as "lastUpdated",
      (ls.previous_balance = 0 and ls.prev_recorded_at = '1970-01-01'::timestamptz) as "isInitial"
    from latest_snapshots ls
    join accounts a on ls.account_id = a.id
    left join (
      select
        account_id,
        sum(case when type = 'income' then amount else -amount end) as linked_net
      from transactions
      where user_id = p_user_id and account_id is not null
      group by account_id
    ) t on ls.account_id = t.account_id
  )
  select jsonb_agg(d) into v_account_deltas from deltas d;

  -- Previous total for global delta
  select coalesce(sum(b.previous_balance), 0) into v_prev_total from (
    select 
      (lag(balance_at_time, 1, 0::bigint) over (partition by account_id order by recorded_at)) as previous_balance,
      row_number() over (partition by account_id order by recorded_at desc) as rn
    from balance_history b
    join accounts a on b.account_id = a.id
    where a.user_id = p_user_id
  ) b where b.rn = 1;
  
  v_total_delta := v_prev_total + v_settings.monthly_income - v_net_worth;
  if v_total_delta < 0 then
    v_total_delta := 0;
  end if;

  v_unaccounted_spending := v_total_delta - v_net_transaction_spending;
   if v_unaccounted_spending < 0 then
    v_unaccounted_spending := 0;
  end if;

  return jsonb_build_object(
    'settings', to_jsonb(v_settings),
    'chartData', v_chart_data,
    'accounts', v_accounts,
    'accountDeltas', coalesce(v_account_deltas, '[]'::jsonb),
    'netWorth', v_net_worth,
    'spendingTotal', v_spending_total,
    'incomeTotal', v_income_total,
    'totalDelta', v_total_delta,
    'unaccountedSpending', v_unaccounted_spending,
    'transactions', coalesce(v_transactions_current_month, '[]'::jsonb)
  );
end;
$$;
