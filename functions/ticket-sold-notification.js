const apn = require('apn');
const { createClient } = require('@supabase/supabase-js');

// Initialisation du client Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Fonction utilitaire pour formater le prix
function formatPrice(amount) {
    return new Intl.NumberFormat('fr-FR', { 
        style: 'currency', 
        currency: 'EUR' 
    }).format(amount);
}

// Point d'entrée de la fonction Netlify
exports.handler = async (event) => {
    console.log(`🔔 Fonction ticket-sold-notification appelée [${event.httpMethod}]`);
    
    // Vérifier la méthode HTTP
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Méthode non autorisée' })
        };
    }

    try {
        // Récupérer les données de la requête
        const body = JSON.parse(event.body);
        console.log('📝 Données de vente de billet reçues:', JSON.stringify(body, null, 2));
        
        // Adapter pour supporter le nouveau format
        const { deviceTokens, ticketSaleData } = body;
        
        // Déterminer si on utilise l'ancien ou le nouveau format
        const isNewFormat = !!deviceTokens && !!ticketSaleData;
        
        // Variables selon le format utilisé
        let event_id, ticket_data, association_id, ticket_id, buyer_info;
        
        if (isNewFormat) {
            console.log('📝 Utilisation du nouveau format de données (deviceTokens + ticketSaleData)');
            event_id = ticketSaleData.event_id;
            ticket_data = {
                id: ticketSaleData.ticket_id || `ticket-${Date.now()}`, // ID généré si non fourni
                total_amount: parseFloat(ticketSaleData.amount) || 0,
                quantity: ticketSaleData.quantity || 1,
                ...ticketSaleData
            };
            
            // Extraire le nom et prénom si disponibles
            let firstName = "", lastName = "";
            if (ticketSaleData.customer_name) {
                const nameParts = ticketSaleData.customer_name.split(" ");
                firstName = nameParts[0] || "";
                lastName = nameParts.slice(1).join(" ") || "";
            }
            
            buyer_info = {
                firstName,
                lastName,
                fullName: ticketSaleData.customer_name || ""
            };
        } else {
            console.log('📝 Utilisation de l\'ancien format de données');
            // Extraction selon l'ancien format
            ({ ticket_id, event_id, association_id, buyer_info, ticket_data } = body);
        }
        
        // Validation des données requises avec messages détaillés
        const validationErrors = [];
        
        if (!event_id) validationErrors.push('event_id manquant');
        if (!deviceTokens || !Array.isArray(deviceTokens) || deviceTokens.length === 0) {
            validationErrors.push('deviceTokens manquants ou invalides');
        }
        
        if (validationErrors.length > 0) {
            console.error('❌ Erreurs de validation:', validationErrors);
            return {
                statusCode: 400,
                body: JSON.stringify({ 
                    error: 'Données invalides ou manquantes', 
                    details: validationErrors,
                    received_data: {
                        format: isNewFormat ? 'nouveau' : 'ancien',
                        has_event_id: !!event_id,
                        has_device_tokens: !!deviceTokens && deviceTokens.length > 0,
                        has_ticket_data: !!ticket_data,
                        body: body
                    }
                })
            };
        }
        
        // Récupérer les informations de l'événement depuis Supabase
        console.log(`🔍 Récupération des informations de l'événement ${event_id}...`);
        const { data: eventData, error: eventError } = await supabase
            .from('events')
            .select('*')
            .eq('id', event_id)
            .single();
            
        if (eventError) {
            console.error('❌ Erreur lors de la récupération de l\'événement:', eventError);
            throw new Error(`Événement non trouvé: ${eventError.message}`);
        }
        
        // Récupérer l'association ID de l'événement si non fourni
        const associationId = association_id || eventData.association_id;
        
        if (!associationId) {
            console.warn('⚠️ Aucun ID d\'association trouvé, impossible d\'envoyer les notifications');
            return {
                statusCode: 400,
                body: JSON.stringify({ 
                    error: 'ID d\'association manquant',
                    event_data: {
                        id: eventData.id,
                        title: eventData.title,
                        has_association_id: !!eventData.association_id
                    }
                })
            };
        }
        
        // Si on utilise le nouveau format avec deviceTokens directs, on ne récupère pas les administrateurs
        let adminTokens = [];
        
        if (isNewFormat) {
            adminTokens = deviceTokens;
            console.log(`📱 ${adminTokens.length} tokens d'appareils fournis directement`);
        } else {
            // Récupérer les tokens des administrateurs de l'association
            const { data: admins, error: adminsError } = await supabase
                .from('association_administrators')
                .select(`
                    user_id,
                    users (
                        device_tokens
                    )
                `)
                .eq('association_id', associationId)
                .eq('role', 'admin');
                
            if (adminsError) {
                console.error('❌ Erreur lors de la récupération des administrateurs:', adminsError);
                throw new Error(`Impossible de récupérer les administrateurs: ${adminsError.message}`);
            }
            
            // Extraire les tokens d'appareils des administrateurs
            console.log(`🔍 Extraction des tokens d'appareils pour ${admins.length} administrateurs...`);
            adminTokens = admins
                .filter(admin => admin.users && admin.users.device_tokens)
                .flatMap(admin => admin.users.device_tokens)
                .filter(token => token); // Filtrer les tokens vides
        }
            
        if (adminTokens.length === 0) {
            console.warn('⚠️ Aucun token d\'appareil trouvé pour l\'envoi de notifications');
            return {
                statusCode: 200,
                body: JSON.stringify({
                    success: false,
                    message: 'Aucun appareil enregistré pour les notifications'
                })
            };
        }
        
        console.log(`📱 ${adminTokens.length} tokens d'appareils trouvés pour les notifications`);
        
        // Initialiser le provider APN
        console.log('🔄 Initialisation du fournisseur APN...');
        console.log('Configuration APN:');
        console.log('APN_KEY_ID:', process.env.APN_KEY_ID);
        console.log('APN_TEAM_ID:', process.env.APN_TEAM_ID);
        console.log('APN_KEY_PATH existe:', !!process.env.APN_KEY_PATH);
        
        // Vérifier l'existence de la clé
        try {
            const fs = require('fs');
            const keyExists = fs.existsSync(process.env.APN_KEY_PATH);
            console.log(`Le fichier de clé existe: ${keyExists ? 'Oui' : 'Non'}`);
            
            if (!keyExists) {
                throw new Error(`Le fichier de clé APN n'existe pas: ${process.env.APN_KEY_PATH}`);
            }
        } catch (error) {
            console.error('❌ Erreur lors de la vérification du fichier de clé:', error);
        }
        
        // Créer le provider APN
        const apnProvider = new apn.Provider({
            token: {
                key: process.env.APN_KEY_PATH,
                keyId: process.env.APN_KEY_ID,
                teamId: process.env.APN_TEAM_ID
            },
            production: process.env.NODE_ENV === 'production'
        });
        
        // Créer la notification
        const notification = new apn.Notification();
        notification.expiry = Math.floor(Date.now() / 1000) + 24 * 3600; // Expire dans 24h
        notification.badge = 1;
        notification.sound = "default";
        
        // Format du nom de l'acheteur et des détails du ticket adaptés au format
        let buyerName, ticketQuantity, ticketPrice;
        
        if (isNewFormat) {
            buyerName = ticketSaleData.customer_name || "Un utilisateur";
            ticketQuantity = ticketSaleData.quantity || 1;
            ticketPrice = formatPrice(parseFloat(ticketSaleData.amount) || 0);
        } else {
            buyerName = buyer_info ? 
                `${buyer_info.firstName} ${buyer_info.lastName}` : 
                "Un utilisateur";
            ticketQuantity = ticket_data.quantity || 1;
            ticketPrice = formatPrice(ticket_data.total_amount || 0);
        }
        
        // Formatage du message de notification
        notification.alert = {
            title: `💰 Nouvelle vente`,
            body: `${buyerName} a acheté ${ticketQuantity} billet${ticketQuantity > 1 ? 's' : ''} pour "${eventData.title}" (${ticketPrice})`
        };
        
        // Ajouter des données supplémentaires
        notification.payload = isNewFormat ? { 
            ticket: ticket_data,
            event: eventData,
            buyer: buyer_info,
            type: 'ticket_sold',
            source: 'ticket_sale_notification'
        } : { 
            ticket: ticket_data,
            event: eventData,
            buyer: buyer_info,
            type: 'ticket_sold',
            ticket_id: ticket_id
        };
        
        notification.topic = "com.babylone";
        
        console.log('🔔 Envoi des notifications de vente aux destinataires...', notification.alert);
        
        // Envoyer la notification à tous les destinataires
        const results = await Promise.all(
            adminTokens.map(token => apnProvider.send(notification, token))
        );
        
        // Analyser les résultats
        const failedTokens = results.flatMap((result, index) => 
            result.failed.map(failure => ({
                token: adminTokens[index],
                reason: failure.response.reason
            }))
        );
        
        if (failedTokens.length > 0) {
            console.error("❌ Certaines notifications ont échoué:", failedTokens);
            
            // Stocker les tokens échoués pour nettoyage futur
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
        
        const successCount = adminTokens.length - failedTokens.length;
        console.log(`✅ ${successCount} notifications envoyées avec succès sur ${adminTokens.length}`);
        
        // Fermer la connexion APN
        apnProvider.shutdown();
        
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                summary: {
                    total: adminTokens.length,
                    success: successCount,
                    failed: failedTokens.length
                }
            })
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