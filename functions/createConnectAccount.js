const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
    console.log('🔔 Fonction createConnectAccount appelée');

    // Vérifier la méthode HTTP
    if (event.httpMethod !== 'POST') {
        console.log('❌ Méthode HTTP non autorisée:', event.httpMethod);
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Méthode non autorisée' })
        };
    }

    try {
        // Récupérer les données de la requête
        const { association_id } = JSON.parse(event.body);
        console.log('📝 Association ID reçu:', association_id);

        if (!association_id) {
            console.log('❌ ID d\'association manquant');
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'ID d\'association requis' })
            };
        }

        // Créer un compte Connect Express
        console.log('🔄 Création du compte Stripe Connect...');
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

        // URL de base pour les redirections
        const baseURL = 'https://bureaudesbureaux.com';
        
        // Créer un lien d'onboarding pour le compte
        console.log('🔄 Création du lien d\'onboarding...');
        const accountLink = await stripe.accountLinks.create({
            account: account.id,
            refresh_url: `${baseURL}/?stripe_connect_refresh=true&account_id=${account.id}`,
            return_url: `${baseURL}/?stripe_connect_return=true&account_id=${account.id}`,
            type: 'account_onboarding'
        });

        // Créer une URL pour le dashboard
        const dashboardUrl = `https://dashboard.stripe.com/${account.id}`;

        // Extraire les données pour le format Swift
        const businessProfile = account.business_profile || {};
        
        // Déterminer les statuts des capacités
        let cardPaymentsStatus = "pending";
        let transfersStatus = "pending";
        
        if (account.capabilities) {
            cardPaymentsStatus = account.capabilities.card_payments || "pending";
            transfersStatus = account.capabilities.transfers || "pending";
        }

        // Réponse formatée selon l'attente de l'app iOS
        const response = {
            accountId: account.id,
            onboardingUrl: accountLink.url,
            dashboardUrl: dashboardUrl,
            chargesEnabled: account.charges_enabled || false,
            payoutsEnabled: account.payouts_enabled || false,
            detailsSubmitted: account.details_submitted || false,
            businessType: account.business_type || "non_profit",
            country: account.country || "FR",
            defaultCurrency: account.default_currency || "eur",
            businessProfile: {
                name: businessProfile.name || "",
                url: businessProfile.url || "",
                product_description: businessProfile.product_description || "Billetterie d'événements étudiants",
                mcc: businessProfile.mcc || "8299"
            },
            metadata: account.metadata || {},
            cardPaymentsStatus: cardPaymentsStatus,
            transfersStatus: transfersStatus
        };

        // Logs pour le suivi
        console.log('✅ Compte Stripe Connect créé:', {
            accountId: account.id,
            associationId: association_id,
            chargesEnabled: response.chargesEnabled,
            payoutsEnabled: response.payoutsEnabled,
            detailsSubmitted: response.detailsSubmitted,
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
        console.error('❌ Erreur lors de la création du compte Connect:', {
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