CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS athletes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name VARCHAR(150) NOT NULL,
  ci VARCHAR(20) UNIQUE NOT NULL,
  phone VARCHAR(30) NOT NULL,
  emergency_contact VARCHAR(100) NOT NULL,
  blood_type VARCHAR(10) NOT NULL,
  route VARCHAR(20) NOT NULL, -- '33K_REDOMA' | '22K_ILUSTRES'
  jersey_size VARCHAR(10) NOT NULL, -- caballero: 'S','M','L','XL','XXL' · dama: 'XS','S','M','L','XL'
  payment_status VARCHAR(20) DEFAULT 'PENDING_REVIEW', -- 'PENDING_REVIEW' | 'PARTIAL' | 'PAID' | 'REJECTED'
  total_amount_usd NUMERIC(8, 2) NOT NULL,
  bib_number INT UNIQUE NULL,
  checked_in BOOLEAN DEFAULT FALSE,
  checked_in_at TIMESTAMP NULL,
  qr_token UUID UNIQUE DEFAULT gen_random_uuid(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- CREATE TABLE IF NOT EXISTS no altera tablas ya existentes, así que el nuevo
-- campo de un despliegue previo se agrega aparte con ADD COLUMN IF NOT EXISTS.
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS email VARCHAR(150) NULL;

-- Corte del jersey ('caballero' | 'dama'), agregado junto a jersey_size para separar
-- el rango de tallas de dama (XS-XL) del de caballero (S-XXL). Default 'caballero'
-- para que las inscripciones existentes (todas previas a este campo) queden consistentes.
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS jersey_cut VARCHAR(20) NOT NULL DEFAULT 'caballero';

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID REFERENCES athletes(id) ON DELETE CASCADE,
  amount_bs NUMERIC(12, 2) NOT NULL,
  amount_usd_equiv NUMERIC(8, 2) NOT NULL,
  bcv_rate NUMERIC(10, 4) NOT NULL,
  reference VARCHAR(50) NOT NULL,
  bank_origin VARCHAR(50) NULL,
  proof_url TEXT NULL,
  status VARCHAR(20) DEFAULT 'PENDING', -- 'PENDING' | 'APPROVED' | 'REJECTED'
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_athlete_id ON payments(athlete_id);

-- Asignación de dorsales libre de condiciones de carrera: nextval() es atómico
-- incluso bajo escaneos concurrentes en el paddock, a diferencia de MAX(bib_number)+1.
CREATE SEQUENCE IF NOT EXISTS bib_number_seq START 1;

CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID REFERENCES athletes(id) ON DELETE SET NULL,
  channel VARCHAR(20) NOT NULL, -- 'WHATSAPP' | 'GMAIL' | 'SIMULATOR'
  contact_identifier VARCHAR(100) NOT NULL, -- Teléfono o Email
  last_message TEXT NULL,
  bot_active BOOLEAN DEFAULT TRUE,
  unread_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_athlete_id ON conversations(athlete_id);

-- Fase 5: notas privadas del organizador y el ID oficial de WhatsApp (Meta Cloud API).
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS internal_notes TEXT NULL;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS meta_wa_id VARCHAR(100) NULL;

-- Nombre de perfil de WhatsApp del contacto (Meta "contacts[].profile.name" o el
-- "pushName" de Baileys), para que el CRM muestre el mismo nombre que ve el organizador
-- en la app de WhatsApp, no solo el número.
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS wa_profile_name VARCHAR(150) NULL;

CREATE TABLE IF NOT EXISTS crm_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  sender VARCHAR(20) NOT NULL, -- 'ATHLETE' | 'BOT' | 'ORGANIZER'
  message_body TEXT NOT NULL,
  attachment_url TEXT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Fase 5: asunto del correo cuando el canal es GMAIL.
ALTER TABLE crm_messages ADD COLUMN IF NOT EXISTS email_subject VARCHAR(255) NULL;

CREATE INDEX IF NOT EXISTS idx_crm_messages_conversation_id ON crm_messages(conversation_id);

-- Inscripción grupal: un capitán registra a todo el equipo (ej. "Café Flor de la
-- Patria") en un solo envío con un único comprobante de pago. member_count y
-- discount_percent quedan fijos en la fila del equipo porque se calculan una sola vez,
-- en el momento del envío (10% si member_count >= 10), y no se recalculan después si
-- se suman corredores sueltos al mismo nombre de equipo más adelante.
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(150) NOT NULL,
  route VARCHAR(20) NOT NULL,
  member_count INT NOT NULL,
  discount_percent NUMERIC(5, 2) NOT NULL DEFAULT 0,
  captain_full_name VARCHAR(150) NOT NULL,
  captain_phone VARCHAR(30) NOT NULL,
  captain_email VARCHAR(150) NULL,
  subtotal_amount_usd NUMERIC(10, 2) NOT NULL,
  total_amount_usd NUMERIC(10, 2) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE athletes ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_athletes_team_id ON athletes(team_id);
