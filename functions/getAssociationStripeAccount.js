const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

// Initialisation du client Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

exports.handler = async (event) => {
    console.log('🔔 Fonction getAssociationStripeAccount appelée');

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

        // Récupérer les informations du compte Connect depuis Supabase
        console.log('🔄 Recherche du compte Stripe Connect dans Supabase...');
        const { data: connectAccount, error: connectError } = await supabase
            .from('stripe_connect_accounts')
            .select('*')
            .eq('association_id', association_id)
            .eq('account_status', 'active')
            .single();

        if (connectError) {
            console.error('❌ Erreur lors de la récupération du compte dans Supabase:', connectError);
            return {
                statusCode: 500,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    error: `Erreur de recherche Supabase: ${connectError.message}`,
                    details: connectError
                })
            };
        }

        if (!connectAccount) {
            console.log('⚠️ Aucun compte Stripe Connect actif trouvé pour cette association');
            return {
                statusCode: 404,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    error: 'Aucun compte Stripe Connect actif trouvé pour cette association',
                    hasAccount: false
                })
            };
        }

        // Récupérer les informations actuelles du compte depuis Stripe
        console.log('🔄 Récupération des informations du compte depuis Stripe...');
        const account = await stripe.accounts.retrieve(connectAccount.stripe_account_id);

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
            transfersStatus: transfersStatus,
            hasAccount: true
        };

        console.log('✅ Compte Stripe Connect récupéré avec succès');
        
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
        console.error('❌ Erreur lors de la récupération du compte Connect:', {
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
                error: error.message || 'Erreur lors de la récupération du compte Connect',
                type: error.type,
                code: error.code,
                hasAccount: false
            })
        };
    }
}; 