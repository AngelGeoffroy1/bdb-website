const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

// Initialisation du client Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

exports.handler = async (event) => {
    console.log('🔔 Fonction checkAccountStatus appelée');

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
        const { stripe_account_id, association_id } = JSON.parse(event.body);
        console.log('📝 Vérification du compte:', { stripe_account_id, association_id });

        if (!stripe_account_id) {
            console.log('❌ ID de compte Stripe manquant');
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'ID de compte Stripe requis' })
            };
        }

        // Récupérer les informations actuelles du compte depuis Stripe
        console.log('🔄 Récupération des informations du compte depuis Stripe...');
        const account = await stripe.accounts.retrieve(stripe_account_id);
        
        console.log('📊 État du compte Stripe:', {
            id: account.id,
            charges_enabled: account.charges_enabled,
            payouts_enabled: account.payouts_enabled,
            details_submitted: account.details_submitted,
            requirements: account.requirements ? {
                currently_due: account.requirements.currently_due,
                eventually_due: account.requirements.eventually_due,
                past_due: account.requirements.past_due
            } : 'non disponible'
        });

        // Déterminer le statut en fonction des capacités
        let status = 'onboarding'; // État par défaut
        
        if (account.details_submitted) {
            if (account.charges_enabled && account.payouts_enabled) {
                status = 'active';
            } else {
                status = 'pending_verification';
            }
        }
        
        console.log(`🏷️ Statut déterminé: ${status}`);
        
        // Extraire des informations supplémentaires
        let businessProfile = {};
        if (account.business_profile) {
            businessProfile = {
                name: account.business_profile.name || "",
                url: account.business_profile.url || "",
                product_description: account.business_profile.product_description || "",
                mcc: account.business_profile.mcc || ""
            };
        }

        // Déterminer les statuts des capacités
        let cardPaymentsStatus = "pending";
        let transfersStatus = "pending";
        
        if (account.capabilities) {
            cardPaymentsStatus = account.capabilities.card_payments || "pending";
            transfersStatus = account.capabilities.transfers || "pending";
        }
        
        // Mettre à jour les informations dans Supabase
        console.log('💾 Mise à jour des informations dans Supabase');
        const updateData = {
            account_status: status,
            charges_enabled: account.charges_enabled || false,
            payouts_enabled: account.payouts_enabled || false,
            details_submitted: account.details_submitted || false,
            business_type: account.business_type || null,
            country: account.country || null,
            default_currency: account.default_currency || "eur",
            business_profile: businessProfile,
            card_payments_status: cardPaymentsStatus,
            transfers_status: transfersStatus,
            updated_at: new Date().toISOString(),
            last_webhook_received_at: new Date().toISOString()
        };
        
        const { data, error } = await supabase
            .from('stripe_connect_accounts')
            .update(updateData)
            .eq('stripe_account_id', stripe_account_id)
            .select();
        
        if (error) {
            console.error('❌ Erreur lors de la mise à jour dans Supabase:', error);
            return {
                statusCode: 500,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    error: `Erreur de mise à jour Supabase: ${error.message}`,
                    details: error
                })
            };
        }
        
        console.log('✅ Informations mises à jour avec succès dans Supabase');
        
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                status: status,
                account_id: stripe_account_id,
                charges_enabled: account.charges_enabled,
                payouts_enabled: account.payouts_enabled,
                details_submitted: account.details_submitted,
                updated: true
            })
        };
    } catch (error) {
        console.error('❌ Erreur lors de la vérification du compte:', {
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
                error: error.message || 'Erreur lors de la vérification du compte',
                type: error.type,
                code: error.code
            })
        };
    }
}; 