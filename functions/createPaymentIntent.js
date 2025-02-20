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
        const { amount, currency = 'eur', description } = JSON.parse(event.body);

        if (!amount) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Le montant est requis' })
            };
        }

        // Log pour déboguer
        console.log('Création du PaymentIntent avec:', { amount, currency, description });

        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(amount * 100), // Stripe utilise les centimes
            currency,
            description,
            automatic_payment_methods: {
                enabled: true,
            },
        });

        // Log pour déboguer
        console.log('PaymentIntent créé avec succès:', paymentIntent.id);

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*', // Permet les requêtes CORS
                'Access-Control-Allow-Headers': 'Content-Type',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                clientSecret: paymentIntent.client_secret,
                paymentIntentId: paymentIntent.id
            })
        };
    } catch (error) {
        console.error('Erreur Stripe détaillée:', error);
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*', // Permet les requêtes CORS
                'Access-Control-Allow-Headers': 'Content-Type',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                error: 'Erreur lors de la création du paiement',
                details: error.message
            })
        };
    }
}; 