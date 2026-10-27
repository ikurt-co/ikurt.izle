-- Preparation only. Apply to a local database first; never auto-run against remote D1.
ALTER TABLE stream_gateways ADD COLUMN tenant_id TEXT REFERENCES tenants(id) ON DELETE CASCADE;
CREATE INDEX idx_stream_gateways_tenant ON stream_gateways(tenant_id);
CREATE TABLE stream_policies (
  location_id TEXT PRIMARY KEY REFERENCES locations(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_minutes INTEGER NOT NULL DEFAULT 60 CHECK(session_minutes BETWEEN 5 AND 240),
  max_viewers INTEGER NOT NULL DEFAULT 25 CHECK(max_viewers BETWEEN 1 AND 500),
  timezone TEXT NOT NULL DEFAULT 'Europe/Istanbul',
  weekly_hours TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_stream_policies_tenant ON stream_policies(tenant_id);
CREATE INDEX idx_viewer_session_rate ON viewer_sessions(tenant_id, location_id, ip_hash, created_at);
