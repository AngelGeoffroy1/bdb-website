const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

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
            quantity
        } = JSON.parse(event.body);

        if (!amount) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Le montant est requis' })
            };
        }

        // Créer ou récupérer un client Stripe
        const customer = await stripe.customers.create({
            email: customer_email,
            name: `${firstName} ${lastName}`,
            phone: customer_phone,
            metadata: {
                event_id,
                quantity: quantity.toString(),
                environment: process.env.STRIPE_SECRET_KEY.startsWith('sk_live') ? 'production' : 'test'
            }
        });

        // Créer une ephemeral key pour ce client
        const ephemeralKey = await stripe.ephemeralKeys.create(
            { customer: customer.id },
            { apiVersion: '2023-10-16' } // Version la plus récente et stable
        );

        // Créer le PaymentIntent avec plus de détails pour la production
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(amount),
            currency,
            customer: customer.id,
            automatic_payment_methods: {
                enabled: true,
            },
            metadata: {
                event_id,
                quantity: quantity.toString(),
                customer_email,
                customer_name: `${firstName} ${lastName}`,
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
            ephemeral_key: ephemeralKey.secret
        };

        // Log sécurisé pour la production
        console.log('Transaction initiée:', {
            paymentIntentId: paymentIntent.id,
            customerId: customer.id,
            amount: paymentIntent.amount,
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
        console.error('Erreur de transaction:', {
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
                error: error.message || 'Erreur lors de la création du paiement',
                type: error.type,
                code: error.code
            })
        };
    }
}; 