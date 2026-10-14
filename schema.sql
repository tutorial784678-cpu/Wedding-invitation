CREATE TABLE IF NOT EXISTS admins (
  id BIGSERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invitation_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS guests (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rsvps (
  id BIGSERIAL PRIMARY KEY,
  guest_name TEXT NOT NULL,
  guest_slug TEXT,
  attendance TEXT NOT NULL CHECK (attendance IN ('yes','no','maybe')),
  party_size INTEGER NOT NULL DEFAULT 1 CHECK (party_size BETWEEN 1 AND 20),
  message TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settings_versions (
  id BIGSERIAL PRIMARY KEY,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO invitation_settings (id, data)
VALUES (1, '{
  "brideName":"Bride Name",
  "groomName":"Groom Name",
  "brideParents":"Daughter of [Parents’ Names]",
  "groomParents":"Son of [Parents’ Names]",
  "guestGreeting":"Dear Guest",
  "intro":"With the blessings of Allah Almighty and the prayers of our families, we cordially invite you to celebrate our blessed Nikah.",
  "date":"2027-01-01",
  "time":"12:00",
  "reception":"Nikah Ceremony & Reception",
  "venue":"Your Wedding Venue",
  "address":"Full venue address goes here",
  "mapsUrl":"https://maps.google.com/",
  "rsvpEmail":"",
  "bismillah":true,
  "musicEnabled":false,
  "musicUrl":"",
  "musicVolume":0.35,
  "artworkUrl":"/assets/nikah-artwork.jpg",
  "backgroundColor":"#fffdf7",
  "goldColor":"#b88632",
  "accentColor":"#d4af62",
  "textColor":"#68451c",
  "showParticles":true,
  "countdown":true,
  "published":true
}'::jsonb)
ON CONFLICT (id) DO NOTHING;
