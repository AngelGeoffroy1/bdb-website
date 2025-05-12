const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

// Initialisation du client Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

exports.handler = async (event) => {
    // Vérification des clés Stripe
    if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_PUBLIC_KEY) {
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Configuration Stripe manquante',
                details: 'Les clés API Stripe ne sont pas correctement configurées'
            })
        };
    }

    // Log détaillé des variables d'environnement (masqués pour la production)
    console.log('Environnement Stripe:', {
        mode: process.env.STRIPE_SECRET_KEY.startsWith('sk_live') ? 'production' : 'test',
        hasSecretKey: !!process.env.STRIPE_SECRET_KEY,
        hasPublicKey: !!process.env.STRIPE_PUBLIC_KEY
    });

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Méthode non autorisée' })
        };
    }

    try {
        const {
            amount,
            currency = 'eur',
            customer_email,
            firstName,
            lastName,
            customer_phone,
            event_id,
            quantity,
            association_id
        } = JSON.parse(event.body);

        if (!amount) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Le montant est requis' })
            };
        }

        if (!association_id) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'L\'ID de l\'association est requis' })
            };
        }

        // Récupérer le compte Connect de l'association depuis Supabase
        const { data: connectAccountData, error: connectAccountError } = await supabase
            .from('stripe_connect_accounts')
            .select('*')
            .eq('association_id', association_id)
            .eq('account_status', 'active')
            .single();

        if (connectAccountError || !connectAccountData) {
            return {
                statusCode: 404,
                body: JSON.stringify({ 
                    error: 'Compte Stripe Connect non trouvé ou inactif',
                    details: connectAccountError ? connectAccountError.message : 'L\'association n\'a pas de compte Stripe Connect actif'
                })
            };
        }

        const stripeConnectAccountId = connectAccountData.stripe_account_id;

        // Calculer les frais d'application (5% par exemple)
        const applicationFeeAmount = Math.round(amount * 0.05);

        // Créer ou récupérer un client Stripe
        const customer = await stripe.customers.create({
            email: customer_email,
            name: `${firstName} ${lastName}`,
            phone: customer_phone,
            metadata: {
                event_id,
                quantity: quantity.toString(),
                association_id,
                environment: process.env.STRIPE_SECRET_KEY.startsWith('sk_live') ? 'production' : 'test'
            }
        });

        // Créer une ephemeral key pour ce client
        const ephemeralKey = await stripe.ephemeralKeys.create(
            { customer: customer.id },
            { apiVersion: '2023-10-16' } // Version la plus récente et stable
        );

        // Créer le PaymentIntent avec le compte Connect
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(amount),
            currency,
            customer: customer.id,
            automatic_payment_methods: {
                enabled: true,
            },
            application_fee_amount: applicationFeeAmount,
            transfer_data: {
                destination: stripeConnectAccountId,
            },
            metadata: {
                event_id,
                quantity: quantity.toString(),
                customer_email,
                customer_name: `${firstName} ${lastName}`,
                association_id,
                connect_account_id: stripeConnectAccountId,
                environment: process.env.STRIPE_SECRET_KEY.startsWith('sk_live') ? 'production' : 'test'
            },
            receipt_email: customer_email, // Envoi automatique du reçu
            statement_descriptor: 'BDB EVENT', // Description sur le relevé bancaire
            statement_descriptor_suffix: event_id.substring(0, 8) // Suffixe sur le relevé bancaire
        });

        const response = {
            client_secret: paymentIntent.client_secret,
            publishable_key: process.env.STRIPE_PUBLIC_KEY,
            customer_id: customer.id,
            ephemeral_key: ephemeralKey.secret,
            connect_account_id: stripeConnectAccountId
        };

        // Log sécurisé pour la production
        console.log('Transaction Connect initiée:', {
            paymentIntentId: paymentIntent.id,
            customerId: customer.id,
            connectAccountId: stripeConnectAccountId,
            amount: paymentIntent.amount,
            applicationFee: applicationFeeAmount,
            currency: paymentIntent.currency,
            environment: process.env.STRIPE_SECRET_KEY.startsWith('sk_live') ? 'production' : 'test'
        });

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(response)
        };
    } catch (error) {
        // Log d'erreur sécurisé pour la production
        console.error('Erreur de transaction Connect:', {
            message: error.message,
            type: error.type,
            code: error.code,
            environment: process.env.STRIPE_SECRET_KEY.startsWith('sk_live') ? 'production' : 'test'
        });

        return {
            statusCode: error.statusCode || 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                error: error.message || 'Erreur lors de la création du paiement Connect',
                type: error.type,
                code: error.code
            })
        };
    }
}; 