const fs = require('fs');
const path = require('path');
const forge = require('node-forge');
const archiver = require('archiver');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const fetch = typeof globalThis.fetch === 'function'
    ? (...args) => globalThis.fetch(...args)
    : require('node-fetch');

let sharp = null;
try {
    sharp = require('sharp');
} catch (error) {
    console.warn('sharp non disponible - les images seront utilisées uniquement si elles sont déjà en PNG');
}

const FALLBACK_IMAGES = {
    'icon.png': 'iVBORw0KGgoAAAANSUhEUgAAAB0AAAAdCAIAAADZ8fBYAAAAMElEQVR4nO3MQQ0AMAwDsWwMwp/spJ0Kob8zAJ+2WXA30vgOX/jCF77whS984ZvvASc/AG1NzWdgAAAAAElFTkSuQmCC',
    'icon@2x.png': 'iVBORw0KGgoAAAANSUhEUgAAADoAAAA6CAIAAABu2d1/AAAAdUlEQVR4nNXOQREAIADDsFIH828WDby4RkHONjokRVIkRVIkRVIkRVIkRVIkRVIkRVIkRVIkRVIkRVIkRVIkRVIkRVIkRVIkRVIkRVIkRVIkRVIkRVIkRVIkRVIkRVIkRVIkRVIkRVIkRVIkRVIkRVL8HXhzAQntAKcGssTCAAAAAElFTkSuQmCC',
    'icon@3x.png': 'iVBORw0KGgoAAAANSUhEUgAAAFcAAABXCAIAAAD+qk47AAAAnUlEQVR4nO3QQQ3AMBDAsK4Mjj/ZaY9gaKU5CCI/M7N+3z49cEUUKBQFCkWBQlGgUBQoFAUKRYFCUaBQFCgUBQpFgUJRoFAUKBQFCkWBQlGgUBQoFAUKRYFCUaBQFCgUBQpFgUJRoFAUKBQFCkWBQlGgUBQoFAUKRYFCUaBQFCgUBQpFgUJRoFAUKBQFCkWBQlGgUBQoFAUKReFjeAFa2ADhS8ngqQAAAABJRU5ErkJggg==',
    'logo.png': 'iVBORw0KGgoAAAANSUhEUgAAAKAAAACgCAIAAAAErfB6AAABiElEQVR4nO3RAQkAIBDAQLXB9y9rChHGXYLB9swsus7vAN4yOM7gOIPjDI4zOM7gOIPjDI4zOM7gOIPjDI4zOM7gOIPjDI4zOM7gOIPjDI4zOM7gOIPjDI4zOM7gOIPjDI4zOM7gOIPjDI4zOM7gOIPjDI4zOM7gOIPjDI4zOM7gOIPjDI4zOM7gOIPjDI4zOM7gOIPjDI4zOM7gOIPjDI4zOM7gOIPjDI4zOM7gOIPjDI4zOM7gOIPjDI4zOM7gOIPjDI4zOM7gOIPjDI4zOM7gOIPjDI4zOM7gOIPjDI4zOM7gOIPjDI4zOM7gOIPjDI4zOM7gOIPjDI4zOM7gOIPjDI4zOM7gOIPjDI4zOM7gOIPjDI4zOM7gOIPjDI4zOM7gOIPjDI4zOM7gOIPjDI4zOM7gOIPjDI4zOM7gOIPjDI4zOM7gOIPjDI4zOM7gOIPjDI4zOM7gOIPjDI4zOM7gOIPjDI4zOM7gOIPjDI4zOM7gOIPjDI4zOM7gOIPjDI4zOM7g1XYBArEBc6/0U8wAAAAASUVORK5CYII=',
    'logo@2x.png': 'iVBORw0KGgoAAAANSUhEUgAAAUAAAAFACAIAAABC8jL9AAADuElEQVR4nO3TQQ0AIBDAMMDB+TeLBz5kSatgn+2ZWUDT+R0AvDMwhBkYwgwMYQaGMANDmIEhzMAQZmAIMzCEGRjCDAxhBoYwA0OYgSHMwBBmYAgzMIQZGMIMDGEGhjADQ5iBIczAEGZgCDMwhBkYwgwMYQaGMANDmIEhzMAQZmAIMzCEGRjCDAxhBoYwA0OYgSHMwBBmYAgzMIQZGMIMDGEGhjADQ5iBIczAEGZgCDMwhBkYwgwMYQaGMANDmIEhzMAQZmAIMzCEGRjCDAxhBoYwA0OYgSHMwBBmYAgzMIQZGMIMDGEGhjADQ5iBIczAEGZgCDMwhBkYwgwMYQaGMANDmIEhzMAQZmAIMzCEGRjCDAxhBoYwA0OYgSHMwBBmYAgzMIQZGMIMDGEGhjADQ5iBIczAEGZgCDMwhBkYwgwMYQaGMANDmIEhzMAQZmAIMzCEGRjCDAxhBoYwA0OYgSHMwBBmYAgzMIQZGMIMDGEGhjADQ5iBIczAEGZgCDMwhBkYwgwMYQaGMANDmIEhzMAQZmAIMzCEGRjCDAxhBoYwA0OYgSHMwBBmYAgzMIQZGMIMDGEGhjADQ5iBIczAEGZgCDMwhBkYwgwMYQaGMANDmIEhzMAQZmAIMzCEGRjCDAxhBoYwA0OYgSHMwBBmYAgzMIQZGMIMDGEGhjADQ5iBIczAEGZgCDMwhBkYwgwMYQaGMANDmIEhzMAQZmAIMzCEGRjCDAxhBoYwA0OYgSHMwBBmYAgzMIQZGMIMDGEGhjADQ5iBIczAEGZgCDMwhBkYwgwMYQaGMANDmIEhzMAQZmAIMzCEGRjCDAxhBoYwA0OYgSHMwBBmYAgzMIQZGMIMDGEGhjADQ5iBIczAEGZgCDMwhBkYwgwMYQaGMANDmIEhzMAQZmAIMzCEGRjCDAxhBoYwA0OYgSHMwBBmYAgzMIQZGMIMDGEGhjADQ5iBIczAEGZgCDMwhBkYwgwMYQaGMANDmIEhzMAQZmAIMzCEGRjCDAxhBoYwA0OYgSHMwBBmYAgzMIQZGMIMDGEGhjADQ5iBIczAEGZgCDMwhBkYwgwMYQaGMANDmIEhzMAQZmAIMzCEGRjCDAxhBoYwA0OYgSHMwBBmYAgzMIQZGMIMDGEGhjADQ5iBIczAEGZgCDMwhBkYwgwMYQaGMANDmIFhdV322QKzmP183AAAAABJRU5ErkJggg=='
};

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
        this.brandText = 'BDB';
        this.passCertificateSupabaseName = process.env.PASS_CERTIFICATE_SUPABASE_NAME || 'pass.com.bdb.ticket.p12';
        this.wwdrSupabaseName = process.env.WWDR_CERTIFICATE_SUPABASE_NAME || 'AppleWWDRCAG3.pem';
        this.cachedWwdrCertificate = null;
        this.cachedWwdrAsn1 = null;
        this.cachedWwdrPem = null;
        this.wwdrCertificateLoaded = false;

        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

        if (supabaseUrl && supabaseKey) {
            this.supabase = createClient(supabaseUrl, supabaseKey);
        } else {
            this.supabase = null;
            console.warn('Supabase non configuré - utilisation de l\'ID du ticket pour le QR code');
        }
    }

    extractBarcodeFromObject(ticketData) {
        if (!ticketData || typeof ticketData !== 'object') {
            return null;
        }

        const candidateKeys = [
            'ticket_code',
            'ticketCode',
            'qrCode',
            'qr_code',
            'qr',
            'barcodeMessage',
            'barcode_message'
        ];

        for (const key of candidateKeys) {
            const value = ticketData[key];
            if (value) {
                return value.toString();
            }
        }

        if (ticketData.ticket && typeof ticketData.ticket === 'object') {
            for (const key of candidateKeys) {
                const value = ticketData.ticket[key];
                if (value) {
                    return value.toString();
                }
            }
        }

        return null;
    }

    async resolveBarcodeMessage(ticketData) {
        const directValue = this.extractBarcodeFromObject(ticketData);
        if (directValue) {
            return directValue;
        }

        if (this.supabase) {
            const candidateIds = new Set();
            const idKeys = [
                'ticketId',
                'ticket_id',
                'ticketID',
                'id',
                'ticketUuid',
                'ticket_uuid'
            ];

            for (const key of idKeys) {
                if (ticketData[key]) {
                    candidateIds.add(ticketData[key]);
                }
            }

            if (ticketData.ticket && typeof ticketData.ticket === 'object') {
                for (const key of idKeys) {
                    if (ticketData.ticket[key]) {
                        candidateIds.add(ticketData.ticket[key]);
                    }
                }
            }

            for (const candidate of candidateIds) {
                if (!candidate) {
                    continue;
                }

                try {
                    const { data, error } = await this.supabase
                        .from('tickets')
                        .select('ticket_code')
                        .eq('id', candidate)
                        .maybeSingle();

                    if (error) {
                        console.warn('Erreur Supabase lors de la récupération du ticket:', error.message);
                        continue;
                    }

                    if (data && data.ticket_code) {
                        return data.ticket_code.toString();
                    }
                } catch (supabaseError) {
                    console.warn('Exception Supabase lors de la récupération du ticket:', supabaseError.message);
                }
            }
        }

        return ticketData && ticketData.id ? ticketData.id.toString() : '';
    }

    extractEventId(ticketData) {
        if (!ticketData || typeof ticketData !== 'object') {
            return null;
        }

        const candidates = new Set();

        if (ticketData.event && typeof ticketData.event === 'object') {
            const eventObj = ticketData.event;
            const eventKeys = ['id', 'eventId', 'event_id', 'eventID', 'uuid', 'event_uuid', 'eventUuid'];
            for (const key of eventKeys) {
                if (eventObj[key]) {
                    candidates.add(eventObj[key]);
                }
            }
        }

        const directKeys = ['eventId', 'event_id', 'eventID', 'eventUuid', 'event_uuid'];
        for (const key of directKeys) {
            if (ticketData[key]) {
                candidates.add(ticketData[key]);
            }
        }

        for (const candidate of candidates) {
            if (!candidate) {
                continue;
            }
            if (ticketData.id && candidate === ticketData.id) {
                continue;
            }
            return candidate;
        }

        return null;
    }

    async fetchEventRecord(ticketData) {
        const fallbackEvent = ticketData && typeof ticketData.event === 'object' ? ticketData.event : null;

        if (!ticketData) {
            return fallbackEvent;
        }

        if (!this.supabase) {
            return fallbackEvent;
        }

        const eventId = this.extractEventId(ticketData);
        const eventName = fallbackEvent?.name || ticketData?.eventName;
        const targetDate = fallbackEvent?.date || ticketData?.eventDate;

        try {
            if (eventId) {
                const { data, error } = await this.supabase
                    .from('events')
                    .select('id, name, description, image_url, date, location')
                    .eq('id', eventId)
                    .maybeSingle();

                if (error) {
                    console.warn('Erreur Supabase lors de la récupération de l\'événement via ID:', error.message);
                } else if (data) {
                    return data;
                }
            }

            if (eventName) {
                const { data, error } = await this.supabase
                    .from('events')
                    .select('id, name, description, image_url, date, location')
                    .eq('name', eventName)
                    .order('date', { ascending: false })
                    .limit(5);

                if (error) {
                    console.warn('Erreur Supabase lors de la récupération de l\'événement via nom:', error.message);
                } else if (Array.isArray(data) && data.length > 0) {
                    const match = this.pickClosestEventMatch(data, targetDate);
                    return match || data[0];
                }
            }
        } catch (error) {
            console.warn('Exception lors de la récupération de l\'événement:', error.message);
        }

        return fallbackEvent;
    }

    async fetchEventImage(ticketData, eventRecord) {
        const imageUrlCandidates = [
            eventRecord && typeof eventRecord === 'object' ? eventRecord.image_url : null,
            ticketData?.event?.image_url,
            ticketData?.event?.imageUrl,
            ticketData?.image_url,
            ticketData?.eventImageUrl
        ].filter(Boolean);

        const imageUrl = imageUrlCandidates.length > 0 ? imageUrlCandidates[0] : null;

        if (!imageUrl) {
            return [];
        }

        try {
            const response = await fetch(imageUrl);

            if (!response.ok) {
                console.warn('Échec du téléchargement de l\'image de l\'événement:', response.status, response.statusText);
                return [];
            }

            const contentType = response.headers.get('content-type') || '';
            const arrayBuffer = await response.arrayBuffer();
            const imageBuffer = Buffer.from(arrayBuffer);

            if (sharp) {
                try {
                    const baseImage = await sharp(imageBuffer)
                        .resize({ width: 624, height: 246, fit: 'cover', position: 'centre' })
                        .png()
                        .toBuffer();

                    const retinaImage = await sharp(imageBuffer)
                        .resize({ width: 1248, height: 492, fit: 'cover', position: 'centre' })
                        .png()
                        .toBuffer();

                    const tripleImage = await sharp(imageBuffer)
                        .resize({ width: 1872, height: 738, fit: 'cover', position: 'centre' })
                        .png()
                        .toBuffer();

                    return [
                        { name: 'strip.png', data: baseImage },
                        { name: 'strip@2x.png', data: retinaImage },
                        { name: 'strip@3x.png', data: tripleImage }
                    ];
                } catch (conversionError) {
                    console.warn('Erreur lors de la conversion de l\'image en PNG:', conversionError.message);
                }
            } else if (contentType.includes('png')) {
                return [{ name: 'strip.png', data: imageBuffer }];
            } else {
                console.warn('Image de l\'événement non PNG et sharp indisponible, image ignorée');
            }
        } catch (error) {
            console.warn('Erreur lors de la récupération de l\'image de l\'événement:', error.message);
        }

        return [];
    }

    pickClosestEventMatch(matches, targetDate) {
        if (!Array.isArray(matches) || matches.length === 0) {
            return null;
        }

        if (!targetDate) {
            return matches[0];
        }

        const targetTime = new Date(targetDate).getTime();
        if (Number.isNaN(targetTime)) {
            return matches[0];
        }

        let bestMatch = matches[0];
        let smallestDiff = Infinity;

        for (const match of matches) {
            if (!match || !match.date) {
                continue;
            }

            const matchTime = new Date(match.date).getTime();
            if (Number.isNaN(matchTime)) {
                continue;
            }

            const diff = Math.abs(matchTime - targetTime);
            if (diff < smallestDiff) {
                smallestDiff = diff;
                bestMatch = match;
            }
        }

        return bestMatch;
    }

    // Charger le certificat
    async loadCertificate() {
        try {
            let p12Buffer;
            
            if (this.useSupabase) {
                // Télécharger le certificat depuis Supabase
                console.log('Téléchargement du certificat depuis Supabase...');
                p12Buffer = await this.downloadCertificateFromSupabase(this.passCertificateSupabaseName, { logLabel: 'certificat P12' });
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
        const barcodeMessage = await this.resolveBarcodeMessage(ticketData);
        const eventRecord = await this.fetchEventRecord(ticketData);
        const additionalAssets = await this.fetchEventImage(ticketData, eventRecord);

        const eventName = eventRecord?.name || ticketData?.event?.name || ticketData?.eventName || 'Événement';
        const passDescription = `Billet pour ${eventName}`;
        const eventDescription = eventRecord?.description || ticketData?.event?.description || passDescription;
        const eventDateValue = eventRecord?.date || ticketData?.event?.date || ticketData?.eventDate;
        const eventLocation = eventRecord?.location || ticketData?.event?.location || ticketData?.eventLocation || 'Non spécifié';

        const passTemplate = {
            "formatVersion": 1,
            "passTypeIdentifier": this.passTypeIdentifier,
            "serialNumber": ticketData.id.toString(),
            "teamIdentifier": this.teamIdentifier,
            "organizationName": this.organizationName,
            "description": passDescription,
            "foregroundColor": "rgb(218, 252, 59)",
            "backgroundColor": "rgb(0, 0, 0)",
            "labelColor": "rgb(218, 252, 59)",
            "eventTicket": {
                "headerFields": [
                    {
                        "key": "brand",
                        "label": "",
                        "value": this.brandText,
                        "textAlignment": "PKTextAlignmentCenter"
                    }
                ],
                "primaryFields": [
                    {
                        "key": "event",
                        "label": "Événement",
                        "value": eventName,
                        "textAlignment": "PKTextAlignmentCenter"
                    }
                ],
                "secondaryFields": [
                    {
                        "key": "event_date",
                        "label": "Date",
                        "value": this.formatDisplayDate(eventDateValue),
                        "textAlignment": "PKTextAlignmentCenter"
                    },
                    {
                        "key": "event_time",
                        "label": "Heure",
                        "value": this.formatDisplayTime(eventDateValue),
                        "textAlignment": "PKTextAlignmentCenter"
                    }
                ],
                "auxiliaryFields": [
                    {
                        "key": "location",
                        "label": "Lieu",
                        "value": eventLocation,
                        "textAlignment": "PKTextAlignmentCenter"
                    },
                    {
                        "key": "quantity",
                        "label": "Quantité",
                        "value": `${ticketData.quantity} billet${ticketData.quantity > 1 ? 's' : ''}`,
                        "textAlignment": "PKTextAlignmentCenter"
                    },
                    {
                        "key": "customer",
                        "label": "Nom",
                        "value": `${ticketData.customerFirstName} ${ticketData.customerLastName}`,
                        "textAlignment": "PKTextAlignmentCenter"
                    }
                ],
                "backFields": [
                    {
                        "key": "description",
                        "label": "Description",
                        "value": eventDescription
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
                "message": barcodeMessage,
                "format": "PKBarcodeFormatQR",
                "messageEncoding": "iso-8859-1"
            },
            "relevantDate": this.formatDateForPass(eventDateValue || ticketData.purchaseDate)
        };

        return await this.signPass(passTemplate, additionalAssets);
    }

    // Créer un pass pour un ticket de boîte de nuit
    async createNightclubTicketPass(ticketData) {
        const barcodeMessage = await this.resolveBarcodeMessage(ticketData);

        const passTemplate = {
            "formatVersion": 1,
            "passTypeIdentifier": this.passTypeIdentifier,
            "serialNumber": ticketData.id.toString(),
            "teamIdentifier": this.teamIdentifier,
            "organizationName": this.organizationName,
            "description": `Billet pour ${ticketData.association.name}`,
            "foregroundColor": "rgb(218, 252, 59)",
            "backgroundColor": "rgb(0, 0, 0)",
            "labelColor": "rgb(218, 252, 59)",
            "eventTicket": {
                "headerFields": [
                    {
                        "key": "brand",
                        "label": "",
                        "value": this.brandText,
                        "textAlignment": "PKTextAlignmentCenter"
                    }
                ],
                "primaryFields": [
                    {
                        "key": "venue",
                        "label": "Établissement",
                        "value": ticketData.association.name,
                        "textAlignment": "PKTextAlignmentCenter"
                    }
                ],
                "secondaryFields": [
                    {
                        "key": "ticket_type",
                        "label": "Type de billet",
                        "value": ticketData.ticketType.name,
                        "textAlignment": "PKTextAlignmentCenter"
                    },
                    {
                        "key": "purchase_date",
                        "label": "Date d'achat",
                        "value": this.formatDateForPass(ticketData.purchaseDate),
                        "textAlignment": "PKTextAlignmentCenter"
                    }
                ],
                "auxiliaryFields": [
                    {
                        "key": "quantity",
                        "label": "Quantité",
                        "value": `${ticketData.quantity} billet${ticketData.quantity > 1 ? 's' : ''}`,
                        "textAlignment": "PKTextAlignmentCenter"
                    },
                    {
                        "key": "customer",
                        "label": "Nom",
                        "value": `${ticketData.customerFirstName} ${ticketData.customerLastName}`,
                        "textAlignment": "PKTextAlignmentCenter"
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
                "message": barcodeMessage,
                "format": "PKBarcodeFormatQR",
                "messageEncoding": "iso-8859-1"
            }
        };

        return await this.signPass(passTemplate);
    }

    // Signer le pass
    async signPass(passData, assets = []) {
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
            const files = this.preparePassFiles(passData, assets);

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
    preparePassFiles(passData, assets = []) {
        const fileMap = new Map();

        // pass.json
        const passJson = JSON.stringify(passData, null, 2);
        fileMap.set('pass.json', Buffer.from(passJson, 'utf8'));

        // Images par défaut
        const defaultImages = ['icon.png', 'icon@2x.png', 'icon@3x.png', 'logo.png', 'logo@2x.png'];
        for (const imageName of defaultImages) {
            const imagePath = path.join(__dirname, 'templates', imageName);
            if (fs.existsSync(imagePath)) {
                const imageBuffer = fs.readFileSync(imagePath);
                fileMap.set(imageName, imageBuffer);
            } else if (FALLBACK_IMAGES[imageName]) {
                fileMap.set(imageName, Buffer.from(FALLBACK_IMAGES[imageName], 'base64'));
            }
        }

        if (Array.isArray(assets)) {
            for (const asset of assets) {
                if (asset && asset.name && asset.data) {
                    fileMap.set(asset.name, asset.data);
                }
            }
        }

        const files = [];
        for (const [name, data] of fileMap.entries()) {
            files.push({ name, data });
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
        this.enhancePkcs7ForRawCertificates(p7);
        const manifestBuffer = forge.util.createBuffer(forge.util.encodeUtf8(manifestJson));
        p7.content = manifestBuffer;

        // Ajouter le certificat WWDR d'Apple si disponible
        const wwdrData = await this.loadWwdrCertificate();
        p7.addCertificate(certificate);
        if (wwdrData) {
            if (wwdrData.certificate) {
                p7.addCertificate(wwdrData.certificate);
                console.log('Certificat WWDR ajouté via objet forge (X.509)');
            } else if (wwdrData.asn1) {
                p7.addRawCertificate(wwdrData.asn1);
                console.log('Certificat WWDR ajouté en tant qu\'ASN.1 brut');
            } else if (wwdrData.pem) {
                p7.addRawCertificate(wwdrData.pem);
                console.log('Certificat WWDR ajouté en tant que PEM brut');
            }
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

    formatDisplayDate(date) {
        try {
            const parsedDate = new Date(date);
            if (Number.isNaN(parsedDate.getTime())) {
                return '';
            }
            return parsedDate.toLocaleDateString('fr-FR', {
                day: '2-digit',
                month: '2-digit',
                year: '2-digit'
            });
        } catch (error) {
            console.warn('Erreur formatDisplayDate:', error.message);
            return '';
        }
    }

    formatDisplayTime(date) {
        try {
            const parsedDate = new Date(date);
            if (Number.isNaN(parsedDate.getTime())) {
                return '';
            }
            return parsedDate.toLocaleTimeString('fr-FR', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });
        } catch (error) {
            console.warn('Erreur formatDisplayTime:', error.message);
            return '';
        }
    }

    // Télécharger le certificat depuis Supabase
    async downloadCertificateFromSupabase(recordName, options = {}) {
        try {
            const { logLabel = 'certificat', allowPlaintext = false } = options;
            const certificateName = recordName || this.passCertificateSupabaseName;

            if (!certificateName) {
                throw new Error('Nom du certificat Supabase non fourni');
            }

            console.log(`Début du téléchargement ${logLabel} depuis Supabase...`);
            
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
            console.log(`Recherche du ${logLabel} dans la table certificates... (nom: ${certificateName})`);
            
            let data, error;
            try {
                const result = await supabase
                    .from('certificates')
                    .select('certificate_data')
                    .eq('name', certificateName)
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
                throw new Error(`${logLabel} non trouvé dans Supabase`);
            }
            
            const encodedData = data.certificate_data;
            console.log(`${logLabel.charAt(0).toUpperCase() + logLabel.slice(1)} trouvé, conversion en Buffer...`);

            if (typeof encodedData !== 'string') {
                throw new Error('Le champ certificate_data doit être une chaîne encodée en base64 ou texte brut');
            }

            const trimmedData = encodedData.trim();
            let buffer = Buffer.from(trimmedData, 'base64');

            // Fallback pour les PEM stockés en clair (non base64)
            if (allowPlaintext) {
                const decodedPreview = buffer.toString('utf8').trim();
                if (trimmedData.includes('BEGIN CERTIFICATE') && !decodedPreview.includes('BEGIN CERTIFICATE')) {
                    console.log(`${logLabel.charAt(0).toUpperCase() + logLabel.slice(1)} semble stocké en texte brut, utilisation du contenu UTF-8`);
                    buffer = Buffer.from(trimmedData, 'utf8');
                }
            }

            console.log('Taille du certificat:', buffer.length, 'bytes');
            console.log(`${logLabel.charAt(0).toUpperCase() + logLabel.slice(1)} téléchargé depuis Supabase avec succès`);
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
            if (this.cachedWwdrCertificate || this.cachedWwdrAsn1) {
                return {
                    certificate: this.cachedWwdrCertificate,
                    asn1: this.cachedWwdrAsn1,
                    pem: this.cachedWwdrPem
                };
            }
            // Si aucun certificat n'a été mis en cache (échec précédent),
            // réessayer un nouveau chargement.
        }

        this.wwdrCertificateLoaded = true;
        try {
            const wwdrBase64 = process.env.WWDR_CERTIFICATE_BASE64;
            if (wwdrBase64) {
                try {
                    const wwdrBuffer = Buffer.from(wwdrBase64, 'base64');
                    const parsedFromBase64 = this.parseWwdrCertificateBuffer(wwdrBuffer, 'variable d\'environnement BASE64');
                    if (parsedFromBase64) {
                        return this.cacheWwdrCertificate(parsedFromBase64, 'Certificat WWDR chargé depuis la variable d\'environnement BASE64');
                    }
                } catch (base64Error) {
                    console.warn('Impossible de décoder WWDR_CERTIFICATE_BASE64:', base64Error.message);
                }
            }

            const wwdrPathEnv = process.env.WWDR_CERTIFICATE_PATH;
            const candidatePaths = [];
            if (wwdrPathEnv) {
                candidatePaths.push(wwdrPathEnv);
            }

            const defaultDirs = this.getPotentialCertificateDirs();
            for (const dirPath of defaultDirs) {
                candidatePaths.push(path.join(dirPath, 'AppleWWDRCAG3.pem'));
                candidatePaths.push(path.join(dirPath, 'AppleWWDRCA.pem'));
                candidatePaths.push(path.join(dirPath, 'Apple Worldwide Developer Relations Certification Authority.pem'));

                try {
                    const files = fs.readdirSync(dirPath);
                    for (const fileName of files) {
                        if (!fileName.toLowerCase().includes('wwdr')) {
                            continue;
                        }
                        const fullPath = path.join(dirPath, fileName);
                        if (!candidatePaths.includes(fullPath)) {
                            candidatePaths.push(fullPath);
                        }
                    }
                } catch (dirError) {
                    console.warn(`Impossible de lister le dossier de certificats "${dirPath}" :`, dirError.message);
                }
            }

            console.log('Chemins candidats pour le certificat WWDR:', candidatePaths);

            for (const candidate of candidatePaths) {
                if (candidate && fs.existsSync(candidate)) {
                    try {
                        const fileBuffer = fs.readFileSync(candidate);
                        const parsedFromFile = this.parseWwdrCertificateBuffer(fileBuffer, candidate);
                        if (parsedFromFile) {
                            return this.cacheWwdrCertificate(parsedFromFile, `Certificat WWDR chargé depuis: ${candidate}`);
                        }
                    } catch (fileError) {
                        console.warn(`Impossible de lire le certificat WWDR depuis ${candidate}:`, fileError.message);
                    }
                }
            }

            try {
                const wwdrBuffer = await this.downloadCertificateFromSupabase(this.wwdrSupabaseName, { logLabel: 'certificat WWDR', allowPlaintext: true });
                if (wwdrBuffer && wwdrBuffer.length > 0) {
                    const parsedFromSupabase = this.parseWwdrCertificateBuffer(wwdrBuffer, 'Supabase');
                    if (parsedFromSupabase) {
                        return this.cacheWwdrCertificate(parsedFromSupabase, 'Certificat WWDR téléchargé depuis Supabase');
                    }
                }
            } catch (supabaseError) {
                console.warn('Échec du téléchargement du certificat WWDR depuis Supabase:', supabaseError.message);
            }

            console.warn('Certificat WWDR introuvable. La signature peut être refusée par Apple.');
            return null;
        } catch (error) {
            console.error('Erreur lors du chargement du certificat WWDR:', error.message);
            this.cachedWwdrCertificate = null;
            this.cachedWwdrAsn1 = null;
            this.cachedWwdrPem = null;
            return null;
        }
    }

    cacheWwdrCertificate(parsed, logMessage) {
        this.cachedWwdrCertificate = parsed.certificate || null;
        this.cachedWwdrAsn1 = parsed.asn1 || null;
        this.cachedWwdrPem = parsed.pem || null;
        console.log(logMessage);

        if (!this.cachedWwdrAsn1 && this.cachedWwdrCertificate) {
            try {
                this.cachedWwdrAsn1 = forge.pki.certificateToAsn1(this.cachedWwdrCertificate);
            } catch (error) {
                console.warn('Impossible de convertir le certificat WWDR en ASN.1:', error.message);
            }
        }

        return {
            certificate: this.cachedWwdrCertificate,
            asn1: this.cachedWwdrAsn1,
            pem: this.cachedWwdrPem
        };
    }

    parseWwdrCertificateBuffer(buffer, sourceLabel) {
        if (!buffer || !buffer.length) {
            console.warn(`Certificat WWDR vide depuis ${sourceLabel}`);
            return null;
        }

        let pem = null;
        let certificate = null;
        let asn1Certificate = null;

        const utf8Text = buffer.toString('utf8');
        const trimmedText = utf8Text.trim();

        if (trimmedText.includes('BEGIN CERTIFICATE')) {
            pem = trimmedText;
            try {
                certificate = forge.pki.certificateFromPem(pem);
            } catch (pemError) {
                console.warn(`Impossible de parser le certificat WWDR PEM (${sourceLabel}) :`, pemError.message);
            }

            try {
                const pemBlocks = forge.pem.decode(pem);
                if (pemBlocks && pemBlocks.length > 0) {
                    const derBuffer = forge.util.createBuffer(pemBlocks[0].body, 'binary');
                    asn1Certificate = forge.asn1.fromDer(derBuffer);
                }
            } catch (decodeError) {
                console.warn(`Impossible de décoder le PEM WWDR (${sourceLabel}) :`, decodeError.message);
            }
        } else {
            let derData = buffer;
            const base64Candidate = trimmedText.replace(/\s+/g, '');
            const base64Regex = /^[A-Za-z0-9+/=]+$/;
            if (base64Candidate.length > 0 && base64Candidate.length % 4 === 0 && base64Regex.test(base64Candidate)) {
                try {
                    derData = Buffer.from(base64Candidate, 'base64');
                    console.log(`${sourceLabel}: certificat WWDR détecté en base64, conversion en DER`);
                } catch (base64Error) {
                    console.warn(`${sourceLabel}: impossible de décoder le certificat WWDR en base64:`, base64Error.message);
                }
            }

            try {
                const derBuffer = forge.util.createBuffer(derData.toString('binary'));
                asn1Certificate = forge.asn1.fromDer(derBuffer);
            } catch (derError) {
                console.warn(`${sourceLabel}: impossible de parser le certificat WWDR comme DER:`, derError.message);
            }
        }

        if (!asn1Certificate) {
            return null;
        }

        if (!certificate) {
            try {
                certificate = forge.pki.certificateFromAsn1(asn1Certificate);
            } catch (asn1Error) {
                // Peut échouer pour les certificats ECC, ce n'est pas bloquant
            }
        }

        if (!pem) {
            try {
                const tempCert = certificate || forge.pki.certificateFromAsn1(asn1Certificate);
                pem = forge.pki.certificateToPem(tempCert);
            } catch (pemBuildError) {
                // Ignorer si la conversion PEM n'est pas possible
            }
        }

        return {
            certificate: certificate || null,
            asn1: asn1Certificate,
            pem: pem || null
        };
    }

    enhancePkcs7ForRawCertificates(p7) {
        if (p7._rawCertificateSupportInitialized) {
            return;
        }

        p7._rawCertificateSupportInitialized = true;
        p7._rawCertificates = [];
        const originalToAsn1 = p7.toAsn1.bind(p7);

        p7.addRawCertificate = (input) => {
            try {
                let asn1Certificate = null;

                if (input && typeof input === 'object' && typeof input.tagClass === 'number') {
                    asn1Certificate = input;
                } else if (input && typeof input === 'object' && input.asn1) {
                    asn1Certificate = input.asn1;
                } else if (Buffer.isBuffer(input)) {
                    const derBuffer = forge.util.createBuffer(input.toString('binary'));
                    asn1Certificate = forge.asn1.fromDer(derBuffer);
                } else if (typeof input === 'string') {
                    const trimmed = input.trim();
                    if (trimmed.includes('BEGIN CERTIFICATE')) {
                        const pemBlocks = forge.pem.decode(trimmed);
                        if (pemBlocks && pemBlocks.length > 0) {
                            const derBuffer = forge.util.createBuffer(pemBlocks[0].body, 'binary');
                            asn1Certificate = forge.asn1.fromDer(derBuffer);
                        }
                    } else {
                        const base64Buffer = Buffer.from(trimmed, 'base64');
                        const derBuffer = forge.util.createBuffer(base64Buffer.toString('binary'));
                        asn1Certificate = forge.asn1.fromDer(derBuffer);
                    }
                } else if (input instanceof Uint8Array) {
                    const derBuffer = forge.util.createBuffer(Buffer.from(input).toString('binary'));
                    asn1Certificate = forge.asn1.fromDer(derBuffer);
                }

                if (!asn1Certificate) {
                    console.warn('Format de certificat brut non reconnu, impossible de l\'ajouter au PKCS#7.');
                    return;
                }

                p7._rawCertificates.push(asn1Certificate);
            } catch (error) {
                console.warn('Erreur lors de l\'ajout du certificat brut au PKCS#7:', error.message);
            }
        };

        p7.toAsn1 = () => {
            const asn1Structure = originalToAsn1();

            if (!p7._rawCertificates || p7._rawCertificates.length === 0) {
                return asn1Structure;
            }

            try {
                const signedDataContainer = Array.isArray(asn1Structure.value) ? asn1Structure.value.find((element) => (
                    element.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC &&
                    element.type === 0
                )) : null;

                if (!signedDataContainer || !Array.isArray(signedDataContainer.value) || signedDataContainer.value.length === 0) {
                    return asn1Structure;
                }

                const signedDataSequence = signedDataContainer.value[0];
                if (!signedDataSequence || !Array.isArray(signedDataSequence.value)) {
                    return asn1Structure;
                }

                const sequenceValues = signedDataSequence.value;
                let certificatesElement = sequenceValues.find((element) => (
                    element.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC &&
                    element.type === 0
                ));

                if (!certificatesElement) {
                    certificatesElement = forge.asn1.create(forge.asn1.Class.CONTEXT_SPECIFIC, 0, true, []);
                    sequenceValues.splice(3, 0, certificatesElement);
                }

                const certificateSet = certificatesElement.value;
                for (const rawCert of p7._rawCertificates) {
                    certificateSet.push(rawCert);
                }
            } catch (error) {
                console.warn('Impossible d\'injecter les certificats WWDR bruts dans la structure PKCS#7:', error.message);
            }

            return asn1Structure;
        };
    }

    getPotentialCertificateDirs() {
        const dirs = new Set();
        const envDir = process.env.PASS_CERTIFICATES_DIR;
        if (envDir) {
            dirs.add(envDir);
        }

        const currentDir = __dirname;
        dirs.add(path.join(currentDir, 'certificates'));
        dirs.add(path.join(currentDir, 'pass-signing', 'certificates'));

        const cwd = process.cwd();
        dirs.add(path.join(cwd, 'functions', 'pass-signing', 'certificates'));
        dirs.add(path.join(cwd, 'pass-signing', 'certificates'));
        dirs.add(path.join(cwd, 'certificates'));

        return Array.from(dirs);
    }
}

module.exports = PassSigner;
