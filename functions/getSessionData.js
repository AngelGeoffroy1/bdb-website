const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

// Initialisation du client Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Variables d\'environnement Supabase manquantes');
    throw new Error('Configuration Supabase manquante');
}

const supabase = createClient(supabaseUrl, supabaseKey);

exports.handler = async (event) => {
    console.log('📋 Fonction getSessionData appelée');

    // Vérifier la méthode HTTP
    if (event.httpMethod !== 'GET') {
        console.log('❌ Méthode HTTP non autorisée:', event.httpMethod);
        return {
            statusCode: 405,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'GET, OPTIONS'
            },
            body: JSON.stringify({ error: 'Méthode non autorisée' })
        };
    }

    // Gestion des requêtes OPTIONS pour CORS
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'GET, OPTIONS'
            },
            body: ''
        };
    }

    try {
        // Récupérer l'ID de la session depuis les paramètres de requête
        const sessionId = event.queryStringParameters?.session_id;

        if (!sessionId) {
            console.log('❌ ID de session manquant');
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Access-Control-Allow-Methods': 'GET, OPTIONS'
                },
                body: JSON.stringify({ error: 'ID de session requis' })
            };
        }

        console.log('📝 ID de session reçu:', sessionId);

        // Récupérer les données de la session depuis Stripe
        console.log('🔄 Récupération des données de la session depuis Stripe...');
        const session = await stripe.checkout.sessions.retrieve(sessionId, {
            expand: ['payment_intent', 'customer', 'line_items']
        });

        console.log('✅ Session récupérée:', session.id);

        // Vérifier que le paiement a été effectué avec succès
        if (session.payment_status !== 'paid') {
            console.log('❌ Le paiement n\'a pas été effectué avec succès');
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Access-Control-Allow-Methods': 'GET, OPTIONS'
                },
                body: JSON.stringify({ error: 'Le paiement n\'a pas été effectué avec succès' })
            };
        }

        // Récupérer le nom de l'événement depuis les métadonnées du line item
        let eventName = 'Événement';
        if (session.line_items && session.line_items.data && session.line_items.data.length > 0) {
            const lineItem = session.line_items.data[0];
            if (lineItem.price && lineItem.price.product_data) {
                eventName = lineItem.price.product_data.name.replace(' - Ticket(s)', '');
            }
        }

        // Récupérer les tickets créés pour cette session
        console.log('🎫 Récupération des tickets créés...');
        let tickets = [];
        
        try {
            const { data: ticketsData, error: ticketsError } = await supabase
                .from('tickets')
                .select('ticket_code, quantity, customer_first_name, customer_last_name, created_at')
                .eq('customer_email', session.customer_details?.email || session.metadata?.customer_email)
                .eq('event_id', session.metadata?.event_id)
                .gte('created_at', new Date(session.created * 1000 - 60000).toISOString()) // Tickets créés dans la dernière minute
                .order('created_at', { ascending: false });

            if (!ticketsError && ticketsData) {
                tickets = ticketsData;
                console.log('✅ Tickets récupérés:', tickets.length);
            } else {
                console.log('⚠️ Aucun ticket trouvé ou erreur:', ticketsError?.message);
            }
        } catch (error) {
            console.error('❌ Erreur lors de la récupération des tickets:', error);
        }

        // Construire la réponse avec les données de la session
        const sessionData = {
            id: session.id,
            payment_status: session.payment_status,
            amount_total: session.amount_total,
            currency: session.currency,
            customer_details: session.customer_details,
            metadata: {
                ...session.metadata,
                event_name: eventName
            },
            created: session.created,
            tickets: tickets
        };

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                session: sessionData
            })
        };

    } catch (error) {
        console.error('❌ Erreur inattendue:', error);
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'GET, OPTIONS'
            },
            body: JSON.stringify({ 
                error: 'Erreur interne du serveur',
                details: error.message
            })
        };
    }
};
