-- Serbian niche sources for beginner micro-reading cards. Their texts are
-- never republished: the generator creates a new summary and every card keeps
-- the original link and attribution.
INSERT INTO micro_feed_sources (
    slug, title, source_kind, source_url, language, rights_mode,
    license_code, attribution_name, attribution_url, enabled
) VALUES
    ('beginner-poljska', 'Poljska.rs', 'rss', 'https://poljska.rs/feed/', 'sr', 'summary_only',
     'ALL-RIGHTS-RESERVED', 'Poljska.rs', 'https://poljska.rs/', true),
    ('beginner-putuj', 'Putuj.rs', 'rss', 'https://putuj.rs/feed/', 'sr', 'summary_only',
     'ALL-RIGHTS-RESERVED', 'Putuj.rs', 'https://putuj.rs/', true),
    ('beginner-putriota', 'Putriota', 'rss', 'https://putriota.rs/feed/', 'sr', 'summary_only',
     'ALL-RIGHTS-RESERVED', 'Putriota', 'https://putriota.rs/', true),
    ('beginner-rokselana', 'Rokselanin kofer', 'rss', 'https://www.rokselana.com/feed/', 'sr', 'summary_only',
     'ALL-RIGHTS-RESERVED', 'Rokselanin kofer', 'https://www.rokselana.com/', true),
    ('beginner-hrana', 'Hrana u oblacima', 'rss', 'https://hranauoblacima.rs/feed/', 'sr', 'summary_only',
     'ALL-RIGHTS-RESERVED', 'Hrana u oblacima', 'https://hranauoblacima.rs/', true),
    ('beginner-srce-srbije', 'Srce Srbije', 'rss', 'https://srcesrbije.rs/feed/', 'sr', 'summary_only',
     'ALL-RIGHTS-RESERVED', 'Srce Srbije', 'https://srcesrbije.rs/', true),
    ('beginner-gradnja', 'Gradnja.rs', 'rss', 'https://www.gradnja.rs/feed/', 'sr', 'summary_only',
     'ALL-RIGHTS-RESERVED', 'Gradnja.rs', 'https://www.gradnja.rs/', true),
    ('beginner-kulturizam', 'Kulturizam', 'rss', 'https://kulturizam.com/feed/', 'sr', 'summary_only',
     'ALL-RIGHTS-RESERVED', 'Kulturizam', 'https://kulturizam.com/', true),
    ('beginner-dan-u-beogradu', 'Dan u Beogradu', 'rss', 'https://www.danubeogradu.rs/feed/', 'sr', 'summary_only',
     'ALL-RIGHTS-RESERVED', 'Dan u Beogradu', 'https://www.danubeogradu.rs/', true)
ON CONFLICT (slug) DO UPDATE SET
    title = EXCLUDED.title,
    source_kind = EXCLUDED.source_kind,
    source_url = EXCLUDED.source_url,
    language = EXCLUDED.language,
    rights_mode = EXCLUDED.rights_mode,
    license_code = EXCLUDED.license_code,
    attribution_name = EXCLUDED.attribution_name,
    attribution_url = EXCLUDED.attribution_url,
    enabled = EXCLUDED.enabled,
    updated_at = now();
