-- Create the alpha_track_records table for the Track Record feature

CREATE TABLE IF NOT EXISTS alpha_track_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recorded_date DATE NOT NULL,          -- The date the report was published (e.g. 2026-02-25)
    recommendation_type VARCHAR(20),      -- 'PRE_MARKET' | 'INTRADAY'
    ticker VARCHAR(10) NOT NULL,
    alpha_score NUMERIC NOT NULL,
    grade VARCHAR(5) NOT NULL,            -- 'S', 'A', 'B', etc.
    action VARCHAR(20) NOT NULL,          -- 'STRONG_BUY', 'BUY', etc.
    
    -- Entry Point Data (Calculated via Alpha Engine trade plan)
    price_at_recommendation NUMERIC,      
    entry_zone_lower NUMERIC NOT NULL,    
    entry_zone_upper NUMERIC NOT NULL,    
    target_price NUMERIC NOT NULL,        
    stop_loss_price NUMERIC NOT NULL,     
    
    -- T+3 Verification Data
    target_check_date DATE NOT NULL,      -- When to check the outcome (T+3 business days)
    is_entry_triggered BOOLEAN DEFAULT FALSE, -- Did the price enter [lower, upper] within T~T+3?
    price_at_check NUMERIC,               -- Price at check datetime (or max high if WIN)
    return_pct NUMERIC,                   -- Calculated return percentage
    outcome VARCHAR(20) DEFAULT 'PENDING',-- 'WIN' | 'LOSS' | 'FLAT' | 'INVALID_ENTRY' | 'PENDING'
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indices for fast querying by date and type
CREATE INDEX IF NOT EXISTS idx_alpha_track_records_date 
ON alpha_track_records(recorded_date DESC);

CREATE INDEX IF NOT EXISTS idx_alpha_track_records_pending
ON alpha_track_records(outcome) 
WHERE outcome = 'PENDING';
