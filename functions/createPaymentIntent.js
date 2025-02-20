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

    // Log détaillé des variables d'environnement
    console.log('Environnement variables:', {
        hasStripeSecretKey: !!process.env.STRIPE_SECRET_KEY,
        hasStripePublicKey: !!process.env.STRIPE_PUBLIC_KEY,
        secretKeyFirstChars: process.env.STRIPE_SECRET_KEY ? process.env.STRIPE_SECRET_KEY.substring(0, 10) + '...' : 'non définie',
        publicKeyFirstChars: process.env.STRIPE_PUBLIC_KEY ? process.env.STRIPE_PUBLIC_KEY.substring(0, 10) + '...' : 'non définie'
    });

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Méthode non autorisée' })
        };
    }

    try {
        // Log du corps de la requête
        console.log('Requête reçue:', {
            method: event.httpMethod,
            headers: event.headers,
            body: event.body ? JSON.parse(event.body) : null
        });

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

        console.log('Création du client Stripe...');
        // Créer ou récupérer un client Stripe
        const customer = await stripe.customers.create({
            email: customer_email,
            name: `${firstName} ${lastName}`,
            phone: customer_phone,
            metadata: {
                event_id,
                quantity: quantity.toString()
            }
        });
        console.log('Client Stripe créé:', customer.id);

        console.log('Création de la ephemeral key...');
        // Créer une ephemeral key pour ce client
        const ephemeralKey = await stripe.ephemeralKeys.create(
            { customer: customer.id },
            { apiVersion: '2023-10-16' }
        );
        console.log('Ephemeral key créée');

        console.log('Création du PaymentIntent...');
        // Créer le PaymentIntent
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(amount), // L'app envoie déjà le montant en centimes
            currency,
            customer: customer.id,
            automatic_payment_methods: {
                enabled: true,
            },
            metadata: {
                event_id,
                quantity: quantity.toString(),
                customer_email,
                customer_name: `${firstName} ${lastName}`
            }
        });

        console.log('PaymentIntent créé avec succès:', {
            paymentIntentId: paymentIntent.id,
            amount: paymentIntent.amount,
            currency: paymentIntent.currency,
            customerId: customer.id
        });

        const response = {
            client_secret: paymentIntent.client_secret,
            publishable_key: process.env.STRIPE_PUBLIC_KEY,
            customer_id: customer.id,
            ephemeral_key: ephemeralKey.secret
        };

        console.log('Réponse préparée:', {
            ...response,
            client_secret: response.client_secret.substring(0, 10) + '...',
            ephemeral_key: response.ephemeral_key.substring(0, 10) + '...'
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
        console.error('Erreur Stripe détaillée:', {
            message: error.message,
            type: error.type,
            code: error.code,
            param: error.param,
            statusCode: error.statusCode
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