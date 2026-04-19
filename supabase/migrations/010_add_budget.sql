-- Add monthly_budget to settings
ALTER TABLE settings ADD COLUMN IF NOT EXISTS monthly_budget bigint NOT NULL DEFAULT 0;

-- Add is_budget flag to transactions
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_budget boolean NOT NULL DEFAULT false;

-- Update dashboard RPC to include budget summary
CREATE OR REPLACE FUNCTION get_dashboard_data(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
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
  v_budget_spent_this_month bigint;
  v_budget_rollover bigint;
  v_budget_past_month_count bigint;
  v_budget_past_total_spent bigint;
BEGIN
  -- Settings (with auto-creation)
  SELECT * INTO v_settings FROM public.settings WHERE user_id = p_user_id;
  IF v_settings IS NULL THEN
    INSERT INTO public.settings (user_id, monthly_income, goal_target, goal_target_date)
    VALUES (p_user_id, 20000000, 100000000, '2027-11-01')
    RETURNING * INTO v_settings;
  END IF;

  -- Chart Data (using existing function)
  SELECT jsonb_agg(chart_data) INTO v_chart_data FROM (
    SELECT * FROM get_net_worth_chart_data(p_user_id, 6)
  ) chart_data;

  -- Accounts
  SELECT jsonb_agg(ac) INTO v_accounts FROM (SELECT * FROM accounts WHERE user_id = p_user_id) ac;

  -- Net Worth (sum of current balances)
  SELECT coalesce(sum(balance), 0) INTO v_net_worth FROM accounts WHERE user_id = p_user_id;

  -- Current Month's Transactions
  SELECT
    coalesce(sum(CASE WHEN type = 'spending' THEN amount ELSE 0 END), 0),
    coalesce(sum(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0)
  INTO v_spending_total, v_income_total
  FROM transactions
  WHERE user_id = p_user_id AND date >= date_trunc('month', current_date);

  v_net_transaction_spending := v_spending_total - v_income_total;

  SELECT jsonb_agg(tx) INTO v_transactions_current_month FROM (
    SELECT * FROM transactions
    WHERE user_id = p_user_id AND date >= date_trunc('month', current_date)
    ORDER BY date DESC
  ) tx;

  -- Budget: spent this month
  SELECT coalesce(sum(amount), 0) INTO v_budget_spent_this_month
  FROM transactions
  WHERE user_id = p_user_id
    AND is_budget = true
    AND type = 'spending'
    AND date >= date_trunc('month', current_date);

  -- Budget: rollover from all previous months
  -- rollover = (number_of_past_months * monthly_budget) - total_past_spent
  SELECT count(*), coalesce(sum(month_spent), 0)
  INTO v_budget_past_month_count, v_budget_past_total_spent
  FROM (
    SELECT date_trunc('month', date) AS month,
           coalesce(sum(amount), 0) AS month_spent
    FROM transactions
    WHERE user_id = p_user_id
      AND is_budget = true
      AND type = 'spending'
      AND date < date_trunc('month', current_date)
    GROUP BY date_trunc('month', date)
  ) past_months;

  v_budget_rollover := (v_budget_past_month_count * v_settings.monthly_budget) - v_budget_past_total_spent;

  -- Account Deltas
  WITH ranked_snapshots AS (
    SELECT
      b.account_id,
      b.balance_at_time,
      b.recorded_at,
      coalesce(lag(b.balance_at_time) OVER (PARTITION BY b.account_id ORDER BY b.recorded_at), 0) AS previous_balance,
      coalesce(lag(b.recorded_at) OVER (PARTITION BY b.account_id ORDER BY b.recorded_at), '1970-01-01'::timestamptz) AS prev_recorded_at,
      row_number() OVER (PARTITION BY b.account_id ORDER BY b.recorded_at DESC) AS rn
    FROM balance_history b
    JOIN accounts a ON b.account_id = a.id
    WHERE a.user_id = p_user_id
  ),
  latest_snapshots AS (
    SELECT * FROM ranked_snapshots WHERE rn = 1
  ),
  deltas AS (
    SELECT
      ls.account_id AS "accountId",
      a.name AS "accountName",
      (ls.balance_at_time - ls.previous_balance) AS "rawDelta",
      coalesce(t.linked_net, 0) AS "linkedNet",
      (ls.balance_at_time - ls.previous_balance - coalesce(t.linked_net, 0)) AS "unaccounted",
      ls.recorded_at AS "lastUpdated",
      (ls.previous_balance = 0 AND ls.prev_recorded_at = '1970-01-01'::timestamptz) AS "isInitial"
    FROM latest_snapshots ls
    JOIN accounts a ON ls.account_id = a.id
    LEFT JOIN (
      SELECT
        account_id,
        sum(CASE WHEN type = 'income' THEN amount ELSE -amount END) AS linked_net
      FROM transactions
      WHERE user_id = p_user_id AND account_id IS NOT NULL
      GROUP BY account_id
    ) t ON ls.account_id = t.account_id
  )
  SELECT jsonb_agg(d) INTO v_account_deltas FROM deltas d;

  -- Previous total for global delta
  SELECT coalesce(sum(b.previous_balance), 0) INTO v_prev_total FROM (
    SELECT
      (lag(balance_at_time, 1, 0::bigint) OVER (PARTITION BY account_id ORDER BY recorded_at)) AS previous_balance,
      row_number() OVER (PARTITION BY account_id ORDER BY recorded_at DESC) AS rn
    FROM balance_history b
    JOIN accounts a ON b.account_id = a.id
    WHERE a.user_id = p_user_id
  ) b WHERE b.rn = 1;

  v_total_delta := v_prev_total + v_settings.monthly_income - v_net_worth;
  IF v_total_delta < 0 THEN
    v_total_delta := 0;
  END IF;

  v_unaccounted_spending := v_total_delta - v_net_transaction_spending;
  IF v_unaccounted_spending < 0 THEN
    v_unaccounted_spending := 0;
  END IF;

  RETURN jsonb_build_object(
    'settings', to_jsonb(v_settings),
    'chartData', v_chart_data,
    'accounts', v_accounts,
    'accountDeltas', coalesce(v_account_deltas, '[]'::jsonb),
    'netWorth', v_net_worth,
    'spendingTotal', v_spending_total,
    'incomeTotal', v_income_total,
    'totalDelta', v_total_delta,
    'unaccountedSpending', v_unaccounted_spending,
    'transactions', coalesce(v_transactions_current_month, '[]'::jsonb),
    'budgetSpentThisMonth', v_budget_spent_this_month,
    'budgetRollover', v_budget_rollover
  );
END;
$$;
