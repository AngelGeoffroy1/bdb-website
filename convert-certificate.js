#!/usr/bin/env node

/**
 * Script pour convertir un certificat .p12 en base64
 * Usage: node convert-certificate.js chemin/vers/certificat.p12
 */

const fs = require('fs');
const path = require('path');

function convertCertificateToBase64(certificatePath) {
    try {
        // Vérifier que le fichier existe
        if (!fs.existsSync(certificatePath)) {
            console.error('❌ Erreur: Le fichier certificat n\'existe pas:', certificatePath);
            process.exit(1);
        }

        // Lire le fichier et le convertir en base64
        const certificateBuffer = fs.readFileSync(certificatePath);
        const base64String = certificateBuffer.toString('base64');

        console.log('✅ Certificat converti en base64 avec succès!');
        console.log('');
        console.log('📋 Copie cette valeur dans ta variable d\'environnement PASS_CERTIFICATE_BASE64:');
        console.log('');
        console.log('─'.repeat(80));
        console.log(base64String);
        console.log('─'.repeat(80));
        console.log('');
        console.log('🔧 Instructions:');
        console.log('1. Va dans ton dashboard Netlify');
        console.log('2. Site settings → Environment variables');
        console.log('3. Ajoute PASS_CERTIFICATE_BASE64 avec la valeur ci-dessus');
        console.log('4. Redéploie ton site');

    } catch (error) {
        console.error('❌ Erreur lors de la conversion:', error.message);
        process.exit(1);
    }
}

// Vérifier les arguments
if (process.argv.length < 3) {
    console.log('📖 Usage: node convert-certificate.js chemin/vers/certificat.p12');
    console.log('');
    console.log('💡 Exemple:');
    console.log('   node convert-certificate.js functions/certificates/pass.com.bdb.ticket.p12');
    process.exit(1);
}

const certificatePath = process.argv[2];
convertCertificateToBase64(certificatePath);
