#!/usr/bin/env node

/**
 * Script pour uploader un certificat vers Supabase
 * Usage: node upload-certificate.js chemin/vers/certificat.p12
 */

const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function uploadCertificateToSupabase(certificatePath) {
    try {
        // Vérifier que le fichier existe
        if (!fs.existsSync(certificatePath)) {
            console.error('❌ Erreur: Le fichier certificat n\'existe pas:', certificatePath);
            process.exit(1);
        }

        // Vérifier les variables d'environnement Supabase
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

        if (!supabaseUrl || !supabaseKey) {
            console.error('❌ Erreur: Variables d\'environnement Supabase manquantes');
            console.log('Assure-toi d\'avoir SUPABASE_URL et SUPABASE_SERVICE_KEY dans ton .env');
            process.exit(1);
        }

        // Créer le client Supabase
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Lire le fichier et le convertir en base64
        const certificateBuffer = fs.readFileSync(certificatePath);
        const base64String = certificateBuffer.toString('base64');

        console.log('📤 Upload du certificat vers Supabase...');

        // Insérer ou mettre à jour le certificat dans la table certificates
        const { data, error } = await supabase
            .from('certificates')
            .upsert({
                name: 'pass.com.bdb.ticket.p12',
                certificate_data: base64String,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'name'
            });

        if (error) {
            console.error('❌ Erreur lors de l\'upload:', error.message);
            process.exit(1);
        }

        console.log('✅ Certificat uploadé avec succès vers Supabase!');
        console.log('');
        console.log('🔧 Prochaines étapes:');
        console.log('1. Vérifie que les variables d\'environnement Supabase sont configurées dans Netlify');
        console.log('2. Redéploie ton site');
        console.log('3. Teste la fonction create-event-pass');

    } catch (error) {
        console.error('❌ Erreur lors de l\'upload:', error.message);
        process.exit(1);
    }
}

// Vérifier les arguments
if (process.argv.length < 3) {
    console.log('📖 Usage: node upload-certificate.js chemin/vers/certificat.p12');
    console.log('');
    console.log('💡 Exemple:');
    console.log('   node upload-certificate.js functions/certificates/pass.com.bdb.ticket.p12');
    console.log('');
    console.log('⚠️  Assure-toi d\'avoir configuré SUPABASE_URL et SUPABASE_SERVICE_KEY dans ton .env');
    process.exit(1);
}

const certificatePath = process.argv[2];
uploadCertificateToSupabase(certificatePath);
