const fs = require('fs');
const path = require('path');
const forge = require('node-forge');
const archiver = require('archiver');
const crypto = require('crypto');

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
        this.cachedWwdrCertificate = null;
        this.wwdrCertificateLoaded = false;
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
                console.log('Type de clé:', typeof privateKey);
                console.log('Méthodes disponibles:', Object.getOwnPropertyNames(privateKey));
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
            const certBagList = certBags[forge.pki.oids.certBag];
            if (certBagList && certBagList.length > 0) {
                const certBag = certBagList[0];
                console.log('Certificat trouvé');
                console.log('Cert bag keys:', Object.getOwnPropertyNames(certBag));

                if (certBag.cert && certBag.cert.signatureOid) {
                    certificate = certBag.cert;
                } else if (certBag.cert) {
                    try {
                        certificate = forge.pki.certificateFromAsn1(certBag.cert);
                        console.log('Certificat converti depuis certBag.cert');
                    } catch (convertError) {
                        console.log('Échec conversion certBag.cert:', convertError.message);
                    }
                }

                if (!certificate && certBag.asn1) {
                    try {
                        certificate = forge.pki.certificateFromAsn1(certBag.asn1);
                        console.log('Certificat converti depuis certBag.asn1');
                    } catch (convertError) {
                        console.log('Échec conversion certBag.asn1:', convertError.message);
                    }
                }
            }

            if (!privateKey) {
                console.log('Toutes les méthodes d\'extraction de clé ont échoué');
                console.log('Bags disponibles:', Object.keys(keyBags));
                throw new Error('Aucune clé privée trouvée dans le certificat');
            }

            if (!certificate) {
                throw new Error('Aucun certificat X.509 valide trouvé dans le fichier P12');
            }

            // Vérifier et convertir la clé privée si nécessaire
            if (privateKey && typeof privateKey === 'object' && privateKey.key) {
                console.log('Conversion de la clé privée RSA...');
                console.log('Clé RSA détectée, création de l\'objet forge...');
                try {
                    // Créer une clé privée RSA à partir des paramètres
                    const rsaPrivateKey = forge.pki.rsa.setPrivateKey(
                        privateKey.key.n,  // modulus
                        privateKey.key.e,  // public exponent
                        privateKey.key.d,  // private exponent
                        privateKey.key.p,  // prime1
                        privateKey.key.q,  // prime2
                        privateKey.key.dP, // exponent1
                        privateKey.key.dQ, // exponent2
                        privateKey.key.qInv // coefficient
                    );
                    
                    privateKey = rsaPrivateKey;
                    console.log('Clé privée RSA créée avec succès');
                    console.log('Méthodes disponibles:', Object.getOwnPropertyNames(privateKey));
                } catch (convertError) {
                    console.log('Erreur lors de la création de la clé RSA:', convertError.message);
                    throw new Error('Impossible de créer la clé privée RSA');
                }
            }
            
            // Vérifier que la clé privée a bien la méthode sign
            if (!privateKey || typeof privateKey.sign !== 'function') {
                console.log('Clé privée invalide - méthodes disponibles:', Object.getOwnPropertyNames(privateKey));
                throw new Error('Clé privée invalide - méthode sign manquante');
            }
            
            // Vérifier et convertir le certificat si nécessaire
            if (certificate && typeof certificate === 'object' && !certificate.signatureOid) {
                console.log('Certificat sans signatureOid détecté, tentative de conversion générique...');
                try {
                    certificate = forge.pki.certificateFromAsn1(certificate);
                    console.log('Certificat converti avec signatureOid');
                } catch (convertError) {
                    console.log('Erreur lors de la conversion du certificat:', convertError.message);
                    throw new Error('Impossible de convertir le certificat');
                }
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
            console.log('Début de la signature du pass...');
            const { privateKey, certificate } = await this.loadCertificate();
            
            console.log('Certificat chargé, vérification des clés...');
            console.log('privateKey:', !!privateKey);
            console.log('certificate:', !!certificate);
            
            if (!privateKey) {
                throw new Error('Clé privée non trouvée');
            }
            
            if (!certificate) {
                throw new Error('Certificat non trouvé');
            }
            
            // Préparer les fichiers du pass
            console.log('Préparation des fichiers du pass...');
            const files = this.preparePassFiles(passData);

            // Créer le manifest
            console.log('Création du manifest...');
            const manifest = this.createManifest(files);
            const manifestJson = this.serializeManifest(manifest);

            // Signer le manifest
            console.log('Signature du manifest...');
            const signature = await this.signManifest(manifestJson, privateKey, certificate);

            // Créer le fichier .pkpass
            console.log('Création du fichier .pkpass...');
            const pkpassBuffer = await this.createPkpassFile(files, manifestJson, signature);
            
            console.log('Pass signé avec succès!');
            return pkpassBuffer;
        } catch (error) {
            console.error('Erreur lors de la signature du pass:', error);
            throw error;
        }
    }

    // Préparer les fichiers à inclure dans le pass
    preparePassFiles(passData) {
        const files = [];

        // pass.json
        const passJson = JSON.stringify(passData, null, 2);
        files.push({
            name: 'pass.json',
            data: Buffer.from(passJson, 'utf8')
        });

        // Images par défaut
        const defaultImages = ['logo.png', 'icon.png', 'logo@2x.png', 'icon@2x.png'];
        for (const imageName of defaultImages) {
            const imagePath = path.join(__dirname, 'templates', imageName);
            if (fs.existsSync(imagePath)) {
                const imageBuffer = fs.readFileSync(imagePath);
                files.push({ name: imageName, data: imageBuffer });
            }
        }

        return files;
    }

    // Créer le manifest
    createManifest(files) {
        const manifest = {};

        for (const file of files) {
            const hash = crypto.createHash('sha1').update(file.data).digest('hex');
            manifest[file.name] = hash;
        }

        return manifest;
    }

    // Sérialiser le manifest de manière déterministe
    serializeManifest(manifest) {
        const sortedManifest = {};
        const keys = Object.keys(manifest).sort();
        for (const key of keys) {
            sortedManifest[key] = manifest[key];
        }
        return JSON.stringify(sortedManifest, null, 2);
    }

    // Signer le manifest avec PKCS#7 detached signature
    async signManifest(manifestJson, privateKey, certificate) {
        const p7 = forge.pkcs7.createSignedData();
        const manifestBuffer = forge.util.createBuffer(forge.util.encodeUtf8(manifestJson));
        p7.content = manifestBuffer;

        // Ajouter le certificat WWDR d'Apple si disponible
        const wwdrCertificate = await this.loadWwdrCertificate();
        p7.addCertificate(certificate);
        if (wwdrCertificate) {
            p7.addCertificate(wwdrCertificate);
        }

        p7.addSigner({
            key: privateKey,
            certificate,
            digestAlgorithm: forge.pki.oids.sha1,
            authenticatedAttributes: [
                {
                    type: forge.pki.oids.contentType,
                    value: forge.pki.oids.data
                },
                {
                    type: forge.pki.oids.messageDigest
                },
                {
                    type: forge.pki.oids.signingTime,
                    value: new Date()
                }
            ]
        });

        p7.sign({ detached: true });

        const signatureDer = forge.asn1.toDer(p7.toAsn1()).getBytes();
        return Buffer.from(signatureDer, 'binary');
    }

    // Créer le fichier .pkpass
    async createPkpassFile(files, manifestJson, signature) {
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
            
            // Ajouter les fichiers du pass
            for (const file of files) {
                archive.append(file.data, { name: file.name });
            }

            // Ajouter le manifest et la signature
            archive.append(manifestJson, { name: 'manifest.json' });
            archive.append(signature, { name: 'signature' });

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
            
            let data, error;
            try {
                const result = await supabase
                    .from('certificates')
                    .select('certificate_data')
                    .eq('name', 'pass.com.bdb.ticket.p12')
                    .single();
                
                data = result.data;
                error = result.error;
                
                console.log('Résultat de la requête Supabase:');
                console.log('- data:', !!data);
                console.log('- error:', error);
            } catch (supabaseError) {
                console.log('Erreur lors de la requête Supabase:', supabaseError);
                throw new Error(`Erreur requête Supabase: ${supabaseError.message}`);
            }
            
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

    async loadWwdrCertificate() {
        if (this.wwdrCertificateLoaded) {
            return this.cachedWwdrCertificate;
        }

        this.wwdrCertificateLoaded = true;
        try {
            // Priorité à la variable d'environnement en base64
            const wwdrBase64 = process.env.WWDR_CERTIFICATE_BASE64;
            if (wwdrBase64) {
                const wwdrPem = Buffer.from(wwdrBase64, 'base64').toString('utf8');
                this.cachedWwdrCertificate = forge.pki.certificateFromPem(wwdrPem);
                console.log('Certificat WWDR chargé depuis la variable d\'environnement BASE64');
                return this.cachedWwdrCertificate;
            }

            // Ensuite vérifier un chemin fourni par variable d'environnement
            const wwdrPathEnv = process.env.WWDR_CERTIFICATE_PATH;
            const candidatePaths = [];
            if (wwdrPathEnv) {
                candidatePaths.push(wwdrPathEnv);
            }

            // Chemins par défaut dans le projet
            candidatePaths.push(path.join(__dirname, 'certificates', 'AppleWWDRCAG3.pem'));
            candidatePaths.push(path.join(__dirname, 'certificates', 'AppleWWDRCA.pem'));

            for (const candidate of candidatePaths) {
                if (candidate && fs.existsSync(candidate)) {
                    const wwdrPem = fs.readFileSync(candidate, 'utf8');
                    this.cachedWwdrCertificate = forge.pki.certificateFromPem(wwdrPem);
                    console.log('Certificat WWDR chargé depuis:', candidate);
                    return this.cachedWwdrCertificate;
                }
            }

            console.warn('Certificat WWDR introuvable. La signature peut être refusée par Apple.');
            return null;
        } catch (error) {
            console.error('Erreur lors du chargement du certificat WWDR:', error.message);
            this.cachedWwdrCertificate = null;
            return null;
        }
    }
}

module.exports = PassSigner;
