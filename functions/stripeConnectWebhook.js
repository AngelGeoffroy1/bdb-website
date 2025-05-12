const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

// Initialisation du client Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Méthode non autorisée' })
        };
    }

    // Récupérer la signature de l'en-tête de la requête
    const signature = event.headers['stripe-signature'];
    if (!signature) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Signature Stripe manquante' })
        };
    }

    let stripeEvent;

    try {
        // Vérifier la signature du webhook avec la clé secrète du webhook
        stripeEvent = stripe.webhooks.constructEvent(
            event.body,
            signature,
            process.env.STRIPE_CONNECT_WEBHOOK_SECRET
        );
    } catch (err) {
        console.error('Erreur de signature du webhook:', err.message);
        return {
            statusCode: 400,
            body: JSON.stringify({ error: `Erreur de signature du webhook: ${err.message}` })
        };
    }

    console.log('Événement Stripe reçu:', stripeEvent.type);

    // Traiter les différents types d'événements
    try {
        switch (stripeEvent.type) {
            case 'account.updated':
                await handleAccountUpdated(stripeEvent.data.object);
                break;
            case 'account.application.authorized':
                await handleAccountAuthorized(stripeEvent.data.object);
                break;
            case 'account.application.deauthorized':
                await handleAccountDeauthorized(stripeEvent.data.object);
                break;
            // Autres événements à traiter selon les besoins
            default:
                console.log(`Événement non traité: ${stripeEvent.type}`);
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ received: true })
        };
    } catch (err) {
        console.error(`Erreur lors du traitement de l'événement ${stripeEvent.type}:`, err.message);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: `Erreur lors du traitement de l'événement: ${err.message}` })
        };
    }
};

/**
 * Gère la mise à jour d'un compte Stripe Connect
 */
async function handleAccountUpdated(account) {
    const accountId = account.id;
    
    // Vérifier les détails du compte pour déterminer le statut
    let status = 'onboarding';
    
    if (account.details_submitted && account.charges_enabled && account.payouts_enabled) {
        status = 'active';
    } else if (account.details_submitted) {
        status = 'pending_verification';
    }
    
    console.log(`Mise à jour du compte ${accountId}, nouveau statut: ${status}`);
    
    // Mettre à jour le statut dans Supabase
    const { error } = await supabase
        .from('stripe_connect_accounts')
        .update({
            account_status: status,
            charges_enabled: account.charges_enabled,
            payouts_enabled: account.payouts_enabled,
            details_submitted: account.details_submitted,
            updated_at: new Date().toISOString()
        })
        .eq('stripe_account_id', accountId);
    
    if (error) {
        console.error('Erreur lors de la mise à jour dans Supabase:', error);
        throw new Error(`Erreur de mise à jour Supabase: ${error.message}`);
    }
}

/**
 * Gère l'autorisation d'un compte Stripe Connect
 */
async function handleAccountAuthorized(account) {
    const accountId = account.id;
    
    console.log(`Compte ${accountId} autorisé`);
    
    // Mettre à jour le statut dans Supabase
    const { error } = await supabase
        .from('stripe_connect_accounts')
        .update({
            account_status: 'authorized',
            updated_at: new Date().toISOString()
        })
        .eq('stripe_account_id', accountId);
    
    if (error) {
        console.error('Erreur lors de la mise à jour dans Supabase:', error);
        throw new Error(`Erreur de mise à jour Supabase: ${error.message}`);
    }
}

/**
 * Gère la déautorisation d'un compte Stripe Connect
 */
async function handleAccountDeauthorized(account) {
    const accountId = account.id;
    
    console.log(`Compte ${accountId} déautorisé`);
    
    // Mettre à jour le statut dans Supabase
    const { error } = await supabase
        .from('stripe_connect_accounts')
        .update({
            account_status: 'deauthorized',
            updated_at: new Date().toISOString()
        })
        .eq('stripe_account_id', accountId);
    
    if (error) {
        console.error('Erreur lors de la mise à jour dans Supabase:', error);
        throw new Error(`Erreur de mise à jour Supabase: ${error.message}`);
    }
} 