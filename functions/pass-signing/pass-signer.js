const fs = require('fs');
const path = require('path');
const forge = require('node-forge');
const archiver = require('archiver');

class PassSigner {
    constructor() {
        // Gérer les chemins pour Netlify Functions et développement local
        const isNetlify = process.env.NETLIFY === 'true' || process.env.AWS_LAMBDA_FUNCTION_NAME;
        
        if (isNetlify) {
            // En production Netlify, télécharger le certificat depuis Supabase
            this.certificatePath = null;
            this.certificateBase64 = null;
            this.useSupabase = true;
        } else {
            // En développement local
            this.certificatePath = path.join(__dirname, 'certificates', 'pass.com.bdb.ticket.p12');
            this.certificateBase64 = null;
            this.useSupabase = false;
        }
        
        // Debug: afficher le chemin pour diagnostiquer
        console.log('Chemin du certificat:', this.certificatePath);
        console.log('Certificat base64 disponible:', !!this.certificateBase64);
        console.log('__dirname:', __dirname);
        console.log('isNetlify:', isNetlify);
        
        this.certificatePassword = process.env.PASS_CERTIFICATE_PASSWORD || 'ton_mot_de_passe_certificat';
        this.teamIdentifier = process.env.APPLE_TEAM_IDENTIFIER || 'TYR3BN2ZH2';
        this.passTypeIdentifier = process.env.PASS_TYPE_IDENTIFIER || 'pass.com.bdb.ticket';
        this.organizationName = 'Babylone';
        this.logoText = 'Babylone';
    }

    // Charger le certificat
    async loadCertificate() {
        try {
            let p12Buffer;
            
            if (this.useSupabase) {
                // Télécharger le certificat depuis Supabase
                console.log('Téléchargement du certificat depuis Supabase...');
                p12Buffer = await this.downloadCertificateFromSupabase();
            } else if (this.certificateBase64) {
                // Utiliser le certificat depuis les variables d'environnement
                console.log('Utilisation du certificat depuis les variables d\'environnement');
                p12Buffer = Buffer.from(this.certificateBase64, 'base64');
            } else if (this.certificatePath && fs.existsSync(this.certificatePath)) {
                // Utiliser le fichier local
                console.log('Utilisation du certificat depuis le fichier local');
                p12Buffer = fs.readFileSync(this.certificatePath);
            } else {
                // Aucun certificat trouvé
                console.log('Aucun certificat trouvé!');
                console.log('certificateBase64:', !!this.certificateBase64);
                console.log('certificatePath:', this.certificatePath);
                console.log('useSupabase:', this.useSupabase);
                console.log('Variables d\'environnement disponibles:');
                console.log('- PASS_CERTIFICATE_PASSWORD:', !!process.env.PASS_CERTIFICATE_PASSWORD);
                throw new Error('Aucun certificat trouvé. Vérifiez la configuration.');
            }
            const p12Asn1 = forge.asn1.fromDer(p12Buffer.toString('binary'));
            const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, this.certificatePassword);
            
            console.log('Certificat P12 chargé, extraction des clés...');
            
            // Extraire la clé privée et le certificat
            const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
            const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
            
            console.log('Key bags trouvés:', Object.keys(keyBags));
            console.log('Cert bags trouvés:', Object.keys(certBags));
            
            // Essayer différentes méthodes pour extraire la clé privée
            let privateKey = null;
            let certificate = null;
            
            // Méthode 1: pkcs8ShroudedKeyBag
            if (keyBags[forge.pki.oids.pkcs8ShroudedKeyBag] && keyBags[forge.pki.oids.pkcs8ShroudedKeyBag].length > 0) {
                privateKey = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag][0];
                console.log('Clé privée trouvée via pkcs8ShroudedKeyBag');
            }
            
            // Méthode 2: keyBag (clé non chiffrée)
            if (!privateKey && keyBags[forge.pki.oids.keyBag] && keyBags[forge.pki.oids.keyBag].length > 0) {
                privateKey = keyBags[forge.pki.oids.keyBag][0];
                console.log('Clé privée trouvée via keyBag');
            }
            
            // Méthode 3: Essayer avec friendlyName
            if (!privateKey) {
                const friendlyNameBags = p12.getBags({ friendlyName: 'pass.com.bdb.ticket' });
                if (friendlyNameBags[forge.pki.oids.pkcs8ShroudedKeyBag] && friendlyNameBags[forge.pki.oids.pkcs8ShroudedKeyBag].length > 0) {
                    privateKey = friendlyNameBags[forge.pki.oids.pkcs8ShroudedKeyBag][0];
                    console.log('Clé privée trouvée via friendlyName');
                }
            }
            
            // Extraire le certificat
            if (certBags[forge.pki.oids.certBag] && certBags[forge.pki.oids.certBag].length > 0) {
                certificate = certBags[forge.pki.oids.certBag][0];
                console.log('Certificat trouvé');
            }
            
            if (!privateKey) {
                console.log('Toutes les méthodes d\'extraction de clé ont échoué');
                console.log('Bags disponibles:', Object.keys(keyBags));
                throw new Error('Aucune clé privée trouvée dans le certificat');
            }
            
            if (!certificate) {
                throw new Error('Aucun certificat trouvé dans le fichier P12');
            }
            
            console.log('Clé privée et certificat extraits avec succès');
            return { privateKey, certificate };
        } catch (error) {
            console.error('Erreur lors du chargement du certificat:', error);
            throw error;
        }
    }

    // Créer un pass pour un ticket d'événement
    async createEventTicketPass(ticketData) {
        const passTemplate = {
            "formatVersion": 1,
            "passTypeIdentifier": this.passTypeIdentifier,
            "serialNumber": ticketData.id.toString(),
            "teamIdentifier": this.teamIdentifier,
            "organizationName": this.organizationName,
            "description": `Billet pour ${ticketData.event.name}`,
            "logoText": this.logoText,
            "foregroundColor": "rgb(255, 255, 255)",
            "backgroundColor": "rgb(0, 0, 0)",
            "labelColor": "rgb(255, 255, 255)",
            "eventTicket": {
                "primaryFields": [
                    {
                        "key": "event",
                        "label": "Événement",
                        "value": ticketData.event.name
                    }
                ],
                "secondaryFields": [
                    {
                        "key": "date",
                        "label": "Date",
                        "value": this.formatDateForPass(ticketData.event.date)
                    },
                    {
                        "key": "location",
                        "label": "Lieu",
                        "value": ticketData.event.location || "Non spécifié"
                    }
                ],
                "auxiliaryFields": [
                    {
                        "key": "quantity",
                        "label": "Quantité",
                        "value": `${ticketData.quantity} billet${ticketData.quantity > 1 ? 's' : ''}`
                    },
                    {
                        "key": "customer",
                        "label": "Nom",
                        "value": `${ticketData.customerFirstName} ${ticketData.customerLastName}`
                    }
                ],
                "backFields": [
                    {
                        "key": "description",
                        "label": "Description",
                        "value": ticketData.event.description || `Billet pour ${ticketData.event.name}`
                    },
                    {
                        "key": "purchase_date",
                        "label": "Date d'achat",
                        "value": this.formatDateForPass(ticketData.purchaseDate)
                    },
                    {
                        "key": "total_amount",
                        "label": "Montant total",
                        "value": `${ticketData.totalAmount.toFixed(2)} €`
                    }
                ]
            },
            "barcode": {
                "message": ticketData.id.toString(),
                "format": "PKBarcodeFormatQR",
                "messageEncoding": "iso-8859-1"
            },
            "relevantDate": this.formatDateForPass(ticketData.event.date)
        };

        return await this.signPass(passTemplate);
    }

    // Créer un pass pour un ticket de boîte de nuit
    async createNightclubTicketPass(ticketData) {
        const passTemplate = {
            "formatVersion": 1,
            "passTypeIdentifier": this.passTypeIdentifier,
            "serialNumber": ticketData.id.toString(),
            "teamIdentifier": this.teamIdentifier,
            "organizationName": this.organizationName,
            "description": `Billet pour ${ticketData.association.name}`,
            "logoText": this.logoText,
            "foregroundColor": "rgb(255, 255, 255)",
            "backgroundColor": "rgb(0, 0, 0)",
            "labelColor": "rgb(255, 255, 255)",
            "eventTicket": {
                "primaryFields": [
                    {
                        "key": "venue",
                        "label": "Établissement",
                        "value": ticketData.association.name
                    }
                ],
                "secondaryFields": [
                    {
                        "key": "ticket_type",
                        "label": "Type de billet",
                        "value": ticketData.ticketType.name
                    },
                    {
                        "key": "purchase_date",
                        "label": "Date d'achat",
                        "value": this.formatDateForPass(ticketData.purchaseDate)
                    }
                ],
                "auxiliaryFields": [
                    {
                        "key": "quantity",
                        "label": "Quantité",
                        "value": `${ticketData.quantity} billet${ticketData.quantity > 1 ? 's' : ''}`
                    },
                    {
                        "key": "customer",
                        "label": "Nom",
                        "value": `${ticketData.customerFirstName} ${ticketData.customerLastName}`
                    }
                ],
                "backFields": [
                    {
                        "key": "description",
                        "label": "Description",
                        "value": ticketData.ticketType.description || `Billet pour ${ticketData.association.name}`
                    },
                    {
                        "key": "benefits",
                        "label": "Avantages",
                        "value": ticketData.ticketType.benefits || "Aucun avantage spécifique"
                    },
                    {
                        "key": "total_amount",
                        "label": "Montant total",
                        "value": `${ticketData.totalAmount.toFixed(2)} €`
                    }
                ]
            },
            "barcode": {
                "message": ticketData.id.toString(),
                "format": "PKBarcodeFormatQR",
                "messageEncoding": "iso-8859-1"
            }
        };

        return await this.signPass(passTemplate);
    }

    // Signer le pass
    async signPass(passData) {
        try {
            const { privateKey, certificate } = this.loadCertificate();
            
            // Créer le manifest
            const manifest = this.createManifest(passData);
            
            // Signer le manifest
            const signature = this.signManifest(manifest, privateKey);
            
            // Créer le fichier .pkpass
            const pkpassBuffer = await this.createPkpassFile(passData, manifest, signature, certificate);
            
            return pkpassBuffer;
        } catch (error) {
            console.error('Erreur lors de la signature du pass:', error);
            throw error;
        }
    }

    // Créer le manifest
    createManifest(passData) {
        const manifest = {};
        
        // Ajouter le fichier pass.json
        const passJson = JSON.stringify(passData, null, 2);
        manifest['pass.json'] = Buffer.from(passJson).toString('base64');
        
        // Ajouter les images par défaut si disponibles
        const defaultImages = ['logo.png', 'icon.png', 'logo@2x.png', 'icon@2x.png'];
        for (const imageName of defaultImages) {
            const imagePath = path.join(__dirname, 'templates', imageName);
            if (fs.existsSync(imagePath)) {
                const imageBuffer = fs.readFileSync(imagePath);
                manifest[imageName] = imageBuffer.toString('base64');
            }
        }
        
        return manifest;
    }

    // Signer le manifest
    signManifest(manifest, privateKey) {
        const manifestJson = JSON.stringify(manifest, Object.keys(manifest).sort());
        const manifestBuffer = Buffer.from(manifestJson);
        
        // Créer la signature SHA1
        const md = forge.md.sha1.create();
        md.update(manifestBuffer.toString('binary'));
        const signature = privateKey.sign(md);
        
        return Buffer.from(signature, 'binary');
    }

    // Créer le fichier .pkpass
    async createPkpassFile(passData, manifest, signature, certificate) {
        return new Promise((resolve, reject) => {
            const archive = archiver('zip', {
                zlib: { level: 9 }
            });
            
            const chunks = [];
            
            archive.on('data', (chunk) => {
                chunks.push(chunk);
            });
            
            archive.on('end', () => {
                const buffer = Buffer.concat(chunks);
                resolve(buffer);
            });
            
            archive.on('error', (err) => {
                reject(err);
            });
            
            // Ajouter le fichier pass.json
            const passJson = JSON.stringify(passData, null, 2);
            archive.append(passJson, { name: 'pass.json' });
            
            // Ajouter le manifest
            const manifestJson = JSON.stringify(manifest, Object.keys(manifest).sort());
            archive.append(manifestJson, { name: 'manifest.json' });
            
            // Ajouter la signature
            archive.append(signature, { name: 'signature' });
            
            // Ajouter le certificat
            const certPem = forge.pki.certificateToPem(certificate);
            archive.append(certPem, { name: 'certificate.pem' });
            
            // Ajouter les images par défaut
            const defaultImages = ['logo.png', 'icon.png', 'logo@2x.png', 'icon@2x.png'];
            for (const imageName of defaultImages) {
                const imagePath = path.join(__dirname, 'templates', imageName);
                if (fs.existsSync(imagePath)) {
                    const imageBuffer = fs.readFileSync(imagePath);
                    archive.append(imageBuffer, { name: imageName });
                }
            }
            
            archive.finalize();
        });
    }

    // Formater la date pour le pass
    formatDateForPass(date) {
        if (typeof date === 'string') {
            return new Date(date).toISOString();
        } else if (typeof date === 'number') {
            return new Date(date * 1000).toISOString();
        } else {
            return new Date(date).toISOString();
        }
    }

    // Télécharger le certificat depuis Supabase
    async downloadCertificateFromSupabase() {
        try {
            console.log('Début du téléchargement depuis Supabase...');
            
            const { createClient } = require('@supabase/supabase-js');
            const supabaseUrl = process.env.SUPABASE_URL;
            const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
            
            console.log('Variables Supabase:');
            console.log('- SUPABASE_URL:', !!supabaseUrl);
            console.log('- SUPABASE_SERVICE_KEY:', !!supabaseKey);
            
            if (!supabaseUrl || !supabaseKey) {
                throw new Error('Variables d\'environnement Supabase manquantes');
            }
            
            const supabase = createClient(supabaseUrl, supabaseKey);
            console.log('Client Supabase créé');
            
            // Télécharger le certificat depuis la table certificates
            console.log('Recherche du certificat dans la table certificates...');
            const { data, error } = await supabase
                .from('certificates')
                .select('certificate_data')
                .eq('name', 'pass.com.bdb.ticket.p12')
                .single();
            
            console.log('Résultat de la requête Supabase:');
            console.log('- data:', !!data);
            console.log('- error:', error);
            
            if (error) {
                console.log('Erreur Supabase détaillée:', error);
                throw new Error(`Erreur Supabase: ${error.message}`);
            }
            
            if (!data || !data.certificate_data) {
                throw new Error('Certificat non trouvé dans Supabase');
            }
            
            console.log('Certificat trouvé, conversion en Buffer...');
            const buffer = Buffer.from(data.certificate_data, 'base64');
            console.log('Taille du certificat:', buffer.length, 'bytes');
            console.log('Certificat téléchargé depuis Supabase avec succès');
            return buffer;
            
        } catch (error) {
            console.error('Erreur lors du téléchargement depuis Supabase:', error);
            throw error;
        }
    }

    // Obtenir l'image en base64 (pour les images dynamiques)
    async getImageBase64(imageUrl) {
        try {
            const fetch = require('node-fetch');
            const response = await fetch(imageUrl);
            if (!response.ok) {
                throw new Error(`Erreur lors du téléchargement de l'image: ${response.statusText}`);
            }
            const buffer = await response.buffer();
            return buffer.toString('base64');
        } catch (error) {
            console.error('Erreur lors du téléchargement de l\'image:', error);
            return '';
        }
    }
}

module.exports = PassSigner;