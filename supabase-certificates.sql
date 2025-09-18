-- Table pour stocker les certificats Apple Wallet
-- À exécuter dans l'éditeur SQL de Supabase

CREATE TABLE IF NOT EXISTS certificates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    certificate_data TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_certificates_name ON certificates(name);

-- RLS (Row Level Security) - optionnel
-- ALTER TABLE certificates ENABLE ROW LEVEL SECURITY;

-- Politique pour permettre la lecture (si RLS est activé)
-- CREATE POLICY "Allow read access to certificates" ON certificates
--     FOR SELECT USING (true);

-- Politique pour permettre l'insertion/mise à jour (si RLS est activé)
-- CREATE POLICY "Allow insert/update access to certificates" ON certificates
--     FOR ALL USING (true);

-- Fonction pour mettre à jour updated_at automatiquement
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger pour mettre à jour updated_at
CREATE TRIGGER update_certificates_updated_at 
    BEFORE UPDATE ON certificates 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();
