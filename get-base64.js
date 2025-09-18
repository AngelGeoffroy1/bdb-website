#!/usr/bin/env node

/**
 * Script simple pour obtenir la valeur base64 d'un certificat
 * Usage: node get-base64.js chemin/vers/certificat.p12
 */

const fs = require('fs');

function getBase64(certificatePath) {
    try {
        if (!fs.existsSync(certificatePath)) {
            console.error('❌ Fichier non trouvé:', certificatePath);
            process.exit(1);
        }

        const buffer = fs.readFileSync(certificatePath);
        const base64 = buffer.toString('base64');
        
        console.log('✅ Valeur base64 générée:');
        console.log('');
        console.log('─'.repeat(80));
        console.log(base64);
        console.log('─'.repeat(80));
        console.log('');
        console.log('📋 Instructions:');
        console.log('1. Copie la valeur ci-dessus');
        console.log('2. Va dans Supabase → Table Editor → certificates');
        console.log('3. Insère une nouvelle ligne:');
        console.log('   - name: pass.com.bdb.ticket.p12');
        console.log('   - certificate_data: (colle la valeur base64)');
        
    } catch (error) {
        console.error('❌ Erreur:', error.message);
    }
}

if (process.argv.length < 3) {
    console.log('📖 Usage: node get-base64.js chemin/vers/certificat.p12');
    process.exit(1);
}

getBase64(process.argv[2]);
