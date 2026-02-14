-- user_dashboard table: stores per-user dashboard ticker selections
-- Mirrors user_watchlist / user_portfolio pattern
CREATE TABLE IF NOT EXISTS user_dashboard (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    ticker TEXT NOT NULL,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, ticker)
);

-- RLS: Users can only access their own dashboard tickers
ALTER TABLE user_dashboard ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own dashboard tickers"
    ON user_dashboard FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own dashboard tickers"
    ON user_dashboard FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own dashboard tickers"
    ON user_dashboard FOR DELETE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update own dashboard tickers"
    ON user_dashboard FOR UPDATE
    USING (auth.uid() = user_id);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_dashboard_user_id ON user_dashboard(user_id);
