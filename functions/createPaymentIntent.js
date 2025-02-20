const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
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

        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(amount * 100), // Stripe utilise les centimes
            currency,
            description,
            automatic_payment_methods: {
                enabled: true,
            },
        });

        return {
            statusCode: 200,
            body: JSON.stringify({
                clientSecret: paymentIntent.client_secret,
                paymentIntentId: paymentIntent.id
            })
        };
    } catch (error) {
        console.error('Erreur Stripe:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Erreur lors de la création du paiement',
                details: error.message
            })
        };
    }
}; 