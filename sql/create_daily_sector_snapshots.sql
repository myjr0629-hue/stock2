-- ============================================================================
-- daily_sector_snapshots — 섹터 일일 스냅샷 테이블
-- Supabase SQL Editor에서 실행
-- ============================================================================

CREATE TABLE IF NOT EXISTS daily_sector_snapshots (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    sector_id   TEXT NOT NULL,
    snapshot_date DATE NOT NULL,
    data_json   JSONB NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW(),

    -- Upsert key: 하루에 섹터당 1개
    CONSTRAINT daily_sector_snapshots_unique UNIQUE (sector_id, snapshot_date)
);

-- 빠른 조회를 위한 인덱스
CREATE INDEX IF NOT EXISTS idx_sector_snapshots_sector_date
    ON daily_sector_snapshots (sector_id, snapshot_date DESC);

-- RLS 활성화 (Supabase 기본 정책)
ALTER TABLE daily_sector_snapshots ENABLE ROW LEVEL SECURITY;

-- 읽기 전용 공개 정책 (anon 키로 읽기 가능)
CREATE POLICY "Allow public read access"
    ON daily_sector_snapshots
    FOR SELECT
    USING (true);

-- 서버 사이드에서만 쓰기 가능 (service_role 키)
CREATE POLICY "Allow service_role insert/update"
    ON daily_sector_snapshots
    FOR ALL
    USING (true)
    WITH CHECK (true);
