const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

// Initialisation du client Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

exports.handler = async (event) => {
    console.log('💳 Fonction createWebPaymentIntent appelée');

    // Vérifier la méthode HTTP
    if (event.httpMethod !== 'POST') {
        console.log('❌ Méthode HTTP non autorisée:', event.httpMethod);
        return {
            statusCode: 405,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
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
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            body: ''
        };
    }

    try {
        // Récupérer les données de la requête
        const { event_id, quantity, customerInfo, association_id } = JSON.parse(event.body);
        console.log('📝 Données reçues:', { event_id, quantity, customerInfo });

        // Validation des paramètres
        if (!event_id || !quantity || !customerInfo) {
            console.log('❌ Paramètres manquants');
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS'
                },
                body: JSON.stringify({ error: 'Paramètres manquants' })
            };
        }

        if (!customerInfo.firstName || !customerInfo.lastName || !customerInfo.email) {
            console.log('❌ Informations client incomplètes');
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS'
                },
                body: JSON.stringify({ error: 'Informations client incomplètes' })
            };
        }

        // Récupérer les informations de l'événement
        console.log('🔄 Récupération des informations de l\'événement...');
        const { data: eventData, error: eventError } = await supabase
            .from('events')
            .select(`
                id,
                name,
                price,
                platform_fee_percentage,
                association_id,
                associations (
                    name
                )
            `)
            .eq('id', event_id)
            .eq('is_active', true)
            .single();

        if (eventError || !eventData) {
            console.error('❌ Événement non trouvé:', eventError);
            return {
                statusCode: 404,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS'
                },
                body: JSON.stringify({ error: 'Événement non trouvé' })
            };
        }

        console.log('✅ Événement trouvé:', eventData.name);

        // Calculer les montants
        const baseAmount = eventData.price * quantity;
        const feePercentage = eventData.platform_fee_percentage || 5;
        const feeAmount = (baseAmount * feePercentage) / 100;
        const totalAmount = baseAmount + feeAmount;

        console.log('💰 Calcul des montants:', {
            baseAmount,
            feePercentage,
            feeAmount,
            totalAmount
        });

        // Vérifier si on doit utiliser Stripe Connect
        let useConnectAccount = false;
        let connectAccount = null;

        if (eventData.association_id) {
            console.log('🔍 Vérification du compte Stripe Connect pour l\'association:', eventData.association_id);
            
            const { data: accountData, error: accountError } = await supabase
                .from('stripe_connect_accounts')
                .select('*')
                .eq('association_id', eventData.association_id)
                .eq('account_status', 'active')
                .single();
                
            if (!accountError && accountData && accountData.charges_enabled) {
                connectAccount = accountData;
                useConnectAccount = true;
                console.log('✅ Compte Connect actif trouvé, utilisation du mode Connect');
            } else {
                console.log('ℹ️ Pas de compte Connect actif, utilisation du mode standard');
            }
        }

        // Créer ou récupérer un client Stripe
        console.log('👤 Création/récupération du client Stripe...');
        let customer;
        
        try {
            // Essayer de trouver un client existant par email
            const existingCustomers = await stripe.customers.list({
                email: customerInfo.email,
                limit: 1
            });

            if (existingCustomers.data.length > 0) {
                customer = existingCustomers.data[0];
                console.log('✅ Client existant trouvé:', customer.id);
            } else {
                // Créer un nouveau client
                customer = await stripe.customers.create({
                    email: customerInfo.email,
                    name: `${customerInfo.firstName} ${customerInfo.lastName}`,
                    phone: customerInfo.phone || undefined,
                    metadata: {
                        source: 'bdb_web',
                        event_id: event_id
                    }
                });
                console.log('✅ Nouveau client créé:', customer.id);
            }
        } catch (customerError) {
            console.error('❌ Erreur lors de la création du client:', customerError);
            return {
                statusCode: 500,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS'
                },
                body: JSON.stringify({ error: 'Erreur lors de la création du client' })
            };
        }

        // Créer la session Stripe Checkout
        console.log('🛒 Création de la session Stripe Checkout...');
        
        const sessionParams = {
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'eur',
                        product_data: {
                            name: `${eventData.name} - Ticket(s)`,
                            description: `${quantity} ticket(s) pour l'événement "${eventData.name}"`,
                            metadata: {
                                event_id: event_id,
                                association_id: eventData.association_id || ''
                            }
                        },
                        unit_amount: Math.round(totalAmount * 100 / quantity) // Prix unitaire en centimes
                    },
                    quantity: quantity
                }
            ],
            mode: 'payment',
            customer: customer.id,
            success_url: `${event.headers.origin || 'https://bureaudesbureaux.com'}/paiement-success.html?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${event.headers.origin || 'https://bureaudesbureaux.com'}/paiement.html?id=${event_id}`,
            metadata: {
                event_id: event_id,
                quantity: quantity.toString(),
                customer_email: customerInfo.email,
                customer_name: `${customerInfo.firstName} ${customerInfo.lastName}`,
                customer_phone: customerInfo.phone || '',
                association_id: eventData.association_id || '',
                base_amount: baseAmount.toString(),
                fee_amount: feeAmount.toString(),
                platform_fee_percentage: feePercentage.toString(),
                source: 'bdb_web'
            },
            payment_intent_data: {
                metadata: {
                    event_id: event_id,
                    quantity: quantity.toString(),
                    customer_email: customerInfo.email,
                    customer_name: `${customerInfo.firstName} ${customerInfo.lastName}`,
                    customer_phone: customerInfo.phone || '',
                    association_id: eventData.association_id || '',
                    base_amount: baseAmount.toString(),
                    fee_amount: feeAmount.toString(),
                    platform_fee_percentage: feePercentage.toString(),
                    source: 'bdb_web',
                    environment: process.env.STRIPE_SECRET_KEY.startsWith('sk_live') ? 'production' : 'test'
                }
            }
        };

        // Ajouter les paramètres Stripe Connect si nécessaire
        if (useConnectAccount && connectAccount && feeAmount > 0) {
            sessionParams.payment_intent_data.application_fee_amount = Math.round(feeAmount * 100);
            sessionParams.payment_intent_data.transfer_data = {
                destination: connectAccount.stripe_account_id
            };
            
            // Ajouter des métadonnées supplémentaires pour Connect
            sessionParams.payment_intent_data.metadata.connect_account_id = connectAccount.stripe_account_id;
            sessionParams.payment_intent_data.metadata.payment_type = 'web_connect';
            
            console.log('💳 Session créée avec Stripe Connect:', {
                destination: connectAccount.stripe_account_id,
                application_fee: feeAmount
            });
        } else {
            console.log('💳 Session créée en mode standard');
        }

        const session = await stripe.checkout.sessions.create(sessionParams);

        console.log('✅ Session Stripe Checkout créée:', session.id);

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                sessionId: session.id,
                customerId: customer.id,
                totalAmount: totalAmount,
                useConnect: useConnectAccount
            })
        };

    } catch (error) {
        console.error('❌ Erreur inattendue:', error);
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            body: JSON.stringify({ 
                error: 'Erreur interne du serveur',
                details: error.message
            })
        };
    }
};
