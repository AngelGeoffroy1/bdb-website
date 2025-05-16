const apn = require('apn');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * Nettoie la clé des caractères indésirables ajoutés par Netlify
 * @param {string} key - La clé à nettoyer
 * @returns {string} - La clé nettoyée
 */
function cleanKeyFromNetlify(key) {
  // Enlever les triples guillemets que Netlify ajoute
  let cleanedKey = key.replace(/"""/g, '');
  
  // Enlever les guillemets simples ou doubles entourant la clé
  cleanedKey = cleanedKey.replace(/^["']|["']$/g, '');
  
  // Supprimer tout caractère non imprimable ou non ASCII
  cleanedKey = cleanedKey.replace(/[^\x20-\x7E\n]/g, '');
  
  return cleanedKey;
}

/**
 * Formate une clé en format PEM standard
 * @param {string} key - La clé à formater
 * @returns {string} - La clé formatée
 */
function formatPEMKey(key) {
  // Nettoyer d'abord la clé
  key = cleanKeyFromNetlify(key);
  
  // Extraire le contenu (sans les marqueurs PEM)
  const pemContent = key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----/g, '').trim();
  
  // Supprimer tous les sauts de ligne existants
  const contentWithoutNewlines = pemContent.replace(/\n/g, '');
  
  // Reformater avec des lignes de 64 caractères
  let formattedContent = '';
  for (let i = 0; i < contentWithoutNewlines.length; i += 64) {
    formattedContent += contentWithoutNewlines.slice(i, i + 64) + '\n';
  }
  
  // Reconstruire la clé au format PEM
  return '-----BEGIN PRIVATE KEY-----\n' + formattedContent + '-----END PRIVATE KEY-----\n';
}

// Initialisation du client Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Fonction utilitaire pour formater la date
function formatDate(date) {
    const options = { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    };
    return new Date(date).toLocaleDateString('fr-FR', options);
}

// Initialise le fournisseur APN avec les bonnes configurations
function initAPNProvider() {
    console.log('🔄 Initialisation du fournisseur APN...');
    console.log('Configuration APN:');
    console.log('APN_KEY_ID:', process.env.APN_KEY_ID);
    console.log('APN_TEAM_ID:', process.env.APN_TEAM_ID);
    
    const keyPath = process.env.APN_KEY_PATH;
    const keyExists = fs.existsSync(keyPath);
    console.log(`Le fichier de clé existe: ${keyExists ? 'Oui' : 'Non'}`);

    // Configuration APN
    const apnProvider = new apn.Provider({
        token: {
            key: keyPath,
            keyId: process.env.APN_KEY_ID,
            teamId: process.env.APN_TEAM_ID
        },
        production: process.env.NODE_ENV === 'production' // true pour la production
    });

    return apnProvider;
}

// Envoie des notifications pour un nouvel événement
async function notifyNewEvent(apnProvider, body) {
    console.log('📱 Traitement de la notification pour nouvel événement');
    const { deviceTokens, eventData } = body;
    
    if (!Array.isArray(deviceTokens) || deviceTokens.length === 0) {
        throw new Error("La liste des tokens est vide ou invalide");
    }

    // Créer la notification
    const notification = new apn.Notification();
    notification.expiry = Math.floor(Date.now() / 1000) + 24 * 3600; // Expire dans 24h
    notification.badge = 1;
    notification.sound = "default";
    
    // Formatage du message
    const eventDate = formatDate(eventData.date);
    notification.alert = {
        title: `📅 Nouvel événement : ${eventData.title}`,
        body: `${eventData.location} - ${eventDate}${eventData.price > 0 ? ` - ${eventData.price}€` : ' - Gratuit'}`
    };
    
    // Ajouter des données supplémentaires
    notification.payload = { 
        event: eventData,
        type: 'new_event'
    };
    notification.topic = "com.babylone";

    console.log('🔔 Envoi des notifications:', notification);
    
    // Envoyer la notification à tous les appareils
    const results = await Promise.all(
        deviceTokens.map(token => apnProvider.send(notification, token))
    );

    // Analyser les résultats
    const failedTokens = results.flatMap((result, index) => 
        result.failed.map(failure => ({
            token: deviceTokens[index],
            reason: failure.response.reason
        }))
    );

    if (failedTokens.length > 0) {
        console.error("❌ Certaines notifications ont échoué:", failedTokens);
        
        // Stocker les tokens échoués dans Supabase pour éventuelle nettoyage
        try {
            await supabase
                .from('failed_device_tokens')
                .upsert(failedTokens.map(failure => ({
                    token: failure.token,
                    reason: failure.reason,
                    failed_at: new Date().toISOString()
                })));
            console.log('✅ Tokens échoués enregistrés dans Supabase');
        } catch (error) {
            console.error('❌ Erreur lors de l\'enregistrement des tokens échoués:', error);
        }
    }

    const successCount = deviceTokens.length - failedTokens.length;
    console.log(`✅ ${successCount} notifications envoyées avec succès sur ${deviceTokens.length}`);
    
    return {
        success: true,
        summary: {
            total: deviceTokens.length,
            success: successCount,
            failed: failedTokens.length,
            failedDetails: failedTokens
        }
    };
}

// Envoie une notification pour un ticket vendu
async function notifyTicketSold(apnProvider, body) {
    console.log('📱 Traitement de la notification pour ticket vendu');
    const { deviceTokens, ticketData, eventData, buyerInfo } = body;
    
    if (!Array.isArray(deviceTokens) || deviceTokens.length === 0) {
        throw new Error("La liste des tokens est vide ou invalide");
    }
    
    if (!ticketData || !eventData) {
        throw new Error("Données de ticket ou d'événement manquantes");
    }

    // Créer la notification
    const notification = new apn.Notification();
    notification.expiry = Math.floor(Date.now() / 1000) + 24 * 3600; // Expire dans 24h
    notification.badge = 1;
    notification.sound = "default";
    
    // Format du nom de l'acheteur
    const buyerName = buyerInfo ? 
        `${buyerInfo.firstName} ${buyerInfo.lastName}` : 
        "Un utilisateur";
    
    // Formatage du message
    notification.alert = {
        title: `💰 Vente de billet`,
        body: `${buyerName} a acheté ${ticketData.quantity} billet${ticketData.quantity > 1 ? 's' : ''} pour "${eventData.title}" (${ticketData.total_amount}€)`
    };
    
    // Ajouter des données supplémentaires
    notification.payload = { 
        ticket: ticketData,
        event: eventData,
        buyer: buyerInfo,
        type: 'ticket_sold'
    };
    notification.topic = "com.babylone";

    console.log('🔔 Envoi des notifications de vente:', notification);
    
    // Envoyer la notification à tous les administrateurs de l'événement
    const results = await Promise.all(
        deviceTokens.map(token => apnProvider.send(notification, token))
    );

    // Analyser les résultats
    const failedTokens = results.flatMap((result, index) => 
        result.failed.map(failure => ({
            token: deviceTokens[index],
            reason: failure.response.reason
        }))
    );

    if (failedTokens.length > 0) {
        console.error("❌ Certaines notifications ont échoué:", failedTokens);
    }

    const successCount = deviceTokens.length - failedTokens.length;
    console.log(`✅ ${successCount} notifications envoyées avec succès sur ${deviceTokens.length}`);
    
    return {
        success: true,
        summary: {
            total: deviceTokens.length,
            success: successCount,
            failed: failedTokens.length,
            failedDetails: failedTokens
        }
    };
}

// Envoie une notification de test
async function sendTestNotification(apnProvider, body) {
    console.log('📱 Traitement de la notification de test');
    const { deviceToken } = body;

    if (!deviceToken) {
        throw new Error("Token d'appareil manquant");
    }

    // Créer la notification de test
    const notification = new apn.Notification();
    notification.expiry = Math.floor(Date.now() / 1000) + 3600; // Expire dans 1h
    notification.badge = 1;
    notification.sound = "default";
    notification.alert = {
        title: "Test de notification",
        body: "Cette notification est un test de BDB ! 🎉"
    };
    notification.topic = "com.babylone";

    console.log('🔔 Envoi de la notification de test:', notification);
    
    // Envoyer la notification
    const result = await apnProvider.send(notification, deviceToken);

    if (result.failed.length > 0) {
        console.error("❌ Erreur d'envoi:", result.failed[0].response);
        throw new Error("Erreur lors de l'envoi de la notification: " + JSON.stringify(result.failed[0].response));
    }

    console.log('✅ Notification de test envoyée avec succès');
    return { success: true };
}

// Point d'entrée de la fonction Netlify
exports.handler = async (event, context) => {
    console.log(`🔔 Fonction send-notification appelée [${event.httpMethod}]`);
    
    // Vérifier la méthode HTTP
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Méthode non autorisée' })
        };
    }

    try {
        // Initialiser le provider APN
        const apnProvider = initAPNProvider();
        
        // Récupérer les données de la requête
        const body = JSON.parse(event.body);
        console.log('📝 Requête reçue:', JSON.stringify(body, null, 2));
        
        // Déterminer le type de notification
        const notificationType = body.type || 'test';
        let result;

        // Traiter selon le type
        switch (notificationType) {
            case 'new_event':
                result = await notifyNewEvent(apnProvider, body);
                break;
            case 'ticket_sold':
                result = await notifyTicketSold(apnProvider, body);
                break;
            case 'test':
                result = await sendTestNotification(apnProvider, body);
                break;
            default:
                return {
                    statusCode: 400,
                    body: JSON.stringify({ error: 'Type de notification non reconnu' })
                };
        }

        // Fermer la connexion APN
        apnProvider.shutdown();
        
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(result)
        };
    } catch (error) {
        console.error('❌ Erreur lors de l\'envoi des notifications:', error);
        
        return {
            statusCode: error.statusCode || 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                error: error.message || 'Erreur lors de l\'envoi des notifications',
                stack: error.stack
            })
        };
    }
}; 