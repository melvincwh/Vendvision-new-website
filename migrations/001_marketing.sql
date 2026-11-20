CREATE TABLE IF NOT EXISTS website_enquiries (
  id TEXT PRIMARY KEY, received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  journey TEXT NOT NULL, fields_json TEXT NOT NULL, source TEXT NOT NULL, medium TEXT NOT NULL,
  campaign TEXT NOT NULL, analytics_consent INTEGER NOT NULL, marketing_consent INTEGER NOT NULL,
  qualified_at TEXT, quoted_at TEXT
);
CREATE TABLE IF NOT EXISTS campaign_daily_spend (
  day TEXT NOT NULL, source TEXT NOT NULL, medium TEXT NOT NULL, campaign TEXT NOT NULL,
  spend_sen INTEGER NOT NULL CHECK(spend_sen >= 0), PRIMARY KEY(day,source,medium,campaign)
);
CREATE TABLE IF NOT EXISTS attributed_sales (
  invoice_id TEXT PRIMARY KEY, enquiry_id TEXT NOT NULL REFERENCES website_enquiries(id),
  paid_sen INTEGER NOT NULL CHECK(paid_sen >= 0)
);
CREATE VIEW IF NOT EXISTS marketing_dashboard AS
WITH sales AS (
  SELECT enquiry_id, SUM(paid_sen) AS paid FROM attributed_sales GROUP BY enquiry_id
), activity AS (
  SELECT date(e.received_at,'+8 hours') AS day, source, medium, campaign,
    COUNT(*) AS leads, COUNT(qualified_at) AS qualified, COUNT(quoted_at) AS quotations,
    SUM(CASE WHEN paid > 0 THEN 1 ELSE 0 END) AS won, COALESCE(SUM(paid),0) AS revenue_sen, 0 AS spend_sen
  FROM website_enquiries e LEFT JOIN sales ON e.id=sales.enquiry_id GROUP BY 1,2,3,4
  UNION ALL SELECT day,source,medium,campaign,0,0,0,0,0,spend_sen FROM campaign_daily_spend
)
SELECT day,source,medium,campaign,SUM(spend_sen)/100.0 AS spend_rm,SUM(leads) AS leads,
  SUM(qualified) AS qualified_leads,SUM(quotations) AS quoted_leads,SUM(won) AS converted_leads,
  SUM(revenue_sen)/100.0 AS collected_rm FROM activity GROUP BY day,source,medium,campaign;
