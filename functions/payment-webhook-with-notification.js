const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

// Initialisation du client Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

exports.handler = async (event) => {
    // Vérifier la méthode HTTP
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Méthode non autorisée' })
        };
    }

    // Récupérer la signature du webhook
    const signature = event.headers['stripe-signature'];
    if (!signature) {
        console.error('❌ Signature Stripe manquante');
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Signature Stripe manquante' })
        };
    }

    let stripeEvent;
    try {
        // Vérifier la signature Stripe
        stripeEvent = stripe.webhooks.constructEvent(
            event.body,
            signature,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (error) {
        console.error('❌ Erreur de signature du webhook:', error.message);
        return {
            statusCode: 400,
            body: JSON.stringify({ error: `Erreur de signature du webhook: ${error.message}` })
        };
    }

    console.log(`✅ Événement Stripe reçu: ${stripeEvent.type}`);

    // Gérer les différents types d'événements
    try {
        switch (stripeEvent.type) {
            case 'payment_intent.succeeded':
                return await handlePaymentSucceeded(stripeEvent.data.object);
            case 'payment_intent.payment_failed':
                return await handlePaymentFailed(stripeEvent.data.object);
            default:
                console.log(`⚠️ Événement non géré: ${stripeEvent.type}`);
                return {
                    statusCode: 200,
                    body: JSON.stringify({ received: true, type: stripeEvent.type, action: 'ignored' })
                };
        }
    } catch (error) {
        console.error(`❌ Erreur lors du traitement de ${stripeEvent.type}:`, error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: `Erreur: ${error.message}` })
        };
    }
};

// Gestion des paiements réussis
async function handlePaymentSucceeded(paymentIntent) {
    console.log('💰 Paiement réussi:', paymentIntent.id);
    
    // Extraire les métadonnées du paiement
    const metadata = paymentIntent.metadata || {};
    console.log('📝 Métadonnées du paiement:', metadata);
    
    // Vérifier si les données nécessaires sont présentes
    const eventId = metadata.event_id;
    if (!eventId) {
        console.warn('⚠️ ID d\'événement manquant dans les métadonnées');
        return {
            statusCode: 200,
            body: JSON.stringify({ 
                received: true, 
                action: 'ignored',
                reason: 'Pas d\'ID d\'événement'
            })
        };
    }
    
    try {
        // Récupérer les informations de l'événement
        console.log(`🔍 Récupération des informations de l'événement ${eventId}...`);
        const { data: eventData, error: eventError } = await supabase
            .from('events')
            .select('*')
            .eq('id', eventId)
            .single();
            
        if (eventError) {
            console.error('❌ Erreur lors de la récupération de l\'événement:', eventError);
            throw new Error(`Événement non trouvé: ${eventError.message}`);
        }
        
        // Récupérer les billets associés à ce paiement
        console.log(`🎫 Recherche des billets liés au paiement ${paymentIntent.id}...`);
        
        // Déterminer la table à utiliser en fonction du type d'événement
        const isNightclubType = metadata.type === 'nightclub';
        const ticketsTable = isNightclubType ? 'nightclub_tickets' : 'tickets';
        console.log(`🔍 Recherche dans la table ${ticketsTable} pour l'événement ${eventId} et l'utilisateur ${metadata.user_id}`);
        
        // Récupérer le dernier ticket créé pour cet événement (approche simplifiée)
        const { data: ticketData, error: ticketError } = await supabase
            .from(ticketsTable)
            .select('*')
            .eq('event_id', eventId)
            .eq('user_id', metadata.user_id)
            .order('created_at', { ascending: false })
            .limit(1);
            
        if (ticketError) {
            console.error('❌ Erreur lors de la récupération du ticket:', ticketError);
            throw new Error(`Ticket non trouvé: ${ticketError.message}`);
        }
        
        if (!ticketData || ticketData.length === 0) {
            console.warn('⚠️ Aucun ticket trouvé pour cet événement et cet utilisateur');
            return {
                statusCode: 200,
                body: JSON.stringify({
                    received: true,
                    action: 'notification_skipped',
                    reason: 'Pas de ticket trouvé'
                })
            };
        }
        
        const ticket = ticketData[0];
        console.log('🎫 Ticket trouvé:', ticket.id);
        
        // S'assurer que le ticket a toutes les propriétés nécessaires
        const normalizedTicket = {
            id: ticket.id,
            quantity: ticket.quantity || 1,
            total_amount: ticket.amount / 100 || ticket.total_amount || 0,
            ...ticket
        };
        
        // Construire les informations de l'acheteur
        const buyerInfo = {
            firstName: metadata.customer_first_name || ticket.customer_first_name,
            lastName: metadata.customer_last_name || ticket.customer_last_name,
            email: metadata.customer_email || ticket.customer_email
        };
        
        // Appeler la fonction de notification
        console.log('📱 Envoi de la notification de vente...');
        const notificationPayload = {
            ticket_id: normalizedTicket.id,
            event_id: eventId,
            association_id: eventData.association_id,
            ticket_data: normalizedTicket,
            buyer_info: buyerInfo
        };
        
        console.log('📝 Payload de notification:', JSON.stringify(notificationPayload, null, 2));
        
        // URL de la fonction de notification
        const notificationUrl = "https://bureaudesbureaux.com/.netlify/functions/ticket-sold-notification";
        
        // Envoyer la requête
        const response = await fetch(notificationUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(notificationPayload)
        });
        
        // Vérifier le statut de la réponse
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ Erreur de notification (${response.status}):`, errorText);
            throw new Error(`Erreur lors de l'envoi de la notification: ${response.status} - ${errorText}`);
        }
        
        const notificationResult = await response.json();
        console.log('📱 Résultat de la notification:', notificationResult);
        
        // Enregistrer l'historique de paiement
        console.log('💾 Enregistrement de l\'historique de paiement...');
        await supabase
            .from('payment_history')
            .insert({
                payment_intent_id: paymentIntent.id,
                event_id: eventId,
                user_id: metadata.user_id || ticket.user_id,
                amount: paymentIntent.amount,
                currency: paymentIntent.currency,
                status: 'succeeded',
                created_at: new Date(paymentIntent.created * 1000).toISOString(),
                metadata: metadata
            });
        
        return {
            statusCode: 200,
            body: JSON.stringify({
                received: true,
                action: 'notification_sent',
                notification_result: notificationResult
            })
        };
    } catch (error) {
        console.error('❌ Erreur lors du traitement du paiement réussi:', error);
        return {
            statusCode: 200, // Toujours retourner 200 pour que Stripe ne ré-envoie pas le webhook
            body: JSON.stringify({
                received: true,
                error: `Erreur: ${error.message}`
            })
        };
    }
}

// Gestion des paiements échoués
async function handlePaymentFailed(paymentIntent) {
    console.log('❌ Paiement échoué:', paymentIntent.id);
    
    // Extraire les métadonnées
    const metadata = paymentIntent.metadata || {};
    const eventId = metadata.event_id;
    
    try {
        // Enregistrer l'échec dans les statistiques
        await supabase
            .from('payment_history')
            .insert({
                payment_intent_id: paymentIntent.id,
                event_id: eventId,
                user_id: metadata.user_id,
                amount: paymentIntent.amount,
                currency: paymentIntent.currency,
                status: 'failed',
                error_message: paymentIntent.last_payment_error?.message,
                created_at: new Date(paymentIntent.created * 1000).toISOString(),
                metadata: metadata
            });
            
        return {
            statusCode: 200,
            body: JSON.stringify({
                received: true,
                action: 'payment_failure_recorded'
            })
        };
    } catch (error) {
        console.error('❌ Erreur lors de l\'enregistrement de l\'échec de paiement:', error);
        return {
            statusCode: 200,
            body: JSON.stringify({
                received: true,
                error: `Erreur: ${error.message}`
            })
        };
    }
} 