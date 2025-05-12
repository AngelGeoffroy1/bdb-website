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
        // Récupérer les données de la requête
        const { association_id } = JSON.parse(event.body);

        if (!association_id) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'ID d\'association requis' })
            };
        }

        // Créer un compte Connect Express
        const account = await stripe.accounts.create({
            type: 'express',
            metadata: {
                association_id: association_id
            },
            capabilities: {
                card_payments: { requested: true },
                transfers: { requested: true }
            },
            business_type: 'non_profit',
            business_profile: {
                product_description: 'Billetterie d\'événements étudiants',
                mcc: '8299' // Services éducatifs
            },
            settings: {
                payouts: {
                    schedule: {
                        interval: 'manual' // Paiements manuels initialement
                    }
                }
            }
        });

        // Créer un lien d'onboarding pour le compte
        const accountLink = await stripe.accountLinks.create({
            account: account.id,
            refresh_url: `${process.env.APP_URL || 'https://bureaudesbureaux.com'}/stripe-connect-refresh`,
            return_url: `${process.env.APP_URL || 'https://bureaudesbureaux.com'}/stripe-connect-return`,
            type: 'account_onboarding'
        });

        // Créer une URL pour le dashboard
        const dashboardUrl = `https://dashboard.stripe.com/${account.id}`;

        // Réponse formatée selon l'attente de l'app iOS
        const response = {
            accountId: account.id,
            onboardingUrl: accountLink.url,
            dashboardUrl: dashboardUrl
        };

        // Logs pour le suivi
        console.log('Compte Stripe Connect créé:', {
            accountId: account.id,
            associationId: association_id,
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
        console.error('Erreur lors de la création du compte Connect:', {
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
                error: error.message || 'Erreur lors de la création du compte Connect',
                type: error.type,
                code: error.code
            })
        };
    }
}; 