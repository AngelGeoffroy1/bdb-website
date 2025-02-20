const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
    // Log pour déboguer
    console.log('Environnement variables:', {
        hasStripeKey: !!process.env.STRIPE_SECRET_KEY,
        keyFirstChars: process.env.STRIPE_SECRET_KEY ? process.env.STRIPE_SECRET_KEY.substring(0, 10) + '...' : 'non définie'
    });

    if (!process.env.STRIPE_SECRET_KEY) {
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Configuration Stripe manquante',
                details: 'La clé API Stripe n\'est pas configurée'
            })
        };
    }

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

        console.log('Création de la ephemeral key...');
        // Créer une ephemeral key pour ce client
        const ephemeralKey = await stripe.ephemeralKeys.create(
            { customer: customer.id },
            { apiVersion: '2023-10-16' }
        );

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

        console.log('PaymentIntent créé avec succès:', paymentIntent.id);

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                client_secret: paymentIntent.client_secret,
                publishable_key: process.env.STRIPE_PUBLIC_KEY,
                customer_id: customer.id,
                ephemeral_key: ephemeralKey.secret
            })
        };
    } catch (error) {
        console.error('Erreur Stripe détaillée:', error);
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                error: error.message || 'Erreur lors de la création du paiement'
            })
        };
    }
}; 