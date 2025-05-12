const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
    // Vérifier la méthode HTTP
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Méthode non autorisée' })
        };
    }

    try {
        // Récupérer l'ID du compte Stripe
        const { account_id } = JSON.parse(event.body);

        if (!account_id) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'ID de compte Stripe requis' })
            };
        }

        // Vérifier que le compte existe
        const account = await stripe.accounts.retrieve(account_id);

        if (!account) {
            return {
                statusCode: 404,
                body: JSON.stringify({ error: 'Compte Stripe introuvable' })
            };
        }

        // Créer un nouveau lien d'onboarding
        const accountLink = await stripe.accountLinks.create({
            account: account_id,
            refresh_url: `${process.env.APP_URL || 'https://bureaudesbureaux.com'}/stripe-connect-refresh`,
            return_url: `${process.env.APP_URL || 'https://bureaudesbureaux.com'}/stripe-connect-return`,
            type: 'account_onboarding'
        });

        // Réponse formatée selon l'attente de l'app iOS
        const response = {
            url: accountLink.url
        };

        // Logs pour le suivi
        console.log('Lien d\'onboarding généré:', {
            accountId: account_id,
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
        console.error('Erreur lors de la création du lien d\'onboarding:', {
            message: error.message,
            type: error.type,
            code: error.code
        });

        return {
            statusCode: error.statusCode || 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                error: error.message || 'Erreur lors de la création du lien d\'onboarding',
                type: error.type,
                code: error.code
            })
        };
    }
}; 