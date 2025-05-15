const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

// Initialisation du client Supabase avec logging des variables (sans montrer les valeurs complètes)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
console.log('Config Supabase:', { 
    hasUrl: !!supabaseUrl, 
    hasKey: !!supabaseKey,
    keyLength: supabaseKey ? supabaseKey.length : 0
});

// Initialisation Stripe avec logging (sans montrer la clé complète)
console.log('Config Stripe:', {
    hasSecretKey: !!process.env.STRIPE_SECRET_KEY,
    mode: process.env.STRIPE_SECRET_KEY?.startsWith('sk_live') ? 'production' : 'test',
    hasWebhookSecret: !!process.env.STRIPE_CONNECT_WEBHOOK_SECRET
});

const supabase = createClient(supabaseUrl, supabaseKey);

exports.handler = async (event) => {
    // Log de base pour chaque appel
    console.log(`🔔 Webhook reçu [${event.httpMethod}] | Content-Type: ${event.headers['content-type']} | Signature: ${event.headers['stripe-signature']?.substring(0, 10)}...`);
    
    if (event.httpMethod !== 'POST') {
        console.warn('❌ Méthode non autorisée:', event.httpMethod);
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Méthode non autorisée' })
        };
    }

    // Log détaillé de l'en-tête pour le débogage
    console.log('📋 En-têtes de la requête:', JSON.stringify(event.headers));

    // Récupérer la signature de l'en-tête de la requête
    const signature = event.headers['stripe-signature'];
    if (!signature) {
        console.error('❌ Signature Stripe manquante dans les en-têtes');
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Signature Stripe manquante' })
        };
    }

    let stripeEvent;
    let rawBody = event.body;

    // Vérifier si le corps est déjà une chaîne ou s'il est parsable
    if (typeof rawBody === 'object') {
        console.log('⚠️ Le corps de la requête est un objet, conversion en chaîne');
        rawBody = JSON.stringify(rawBody);
    }

    console.log(`📦 Longueur du corps: ${rawBody.length} caractères | Premier 100 caractères: ${rawBody.substring(0, 100)}...`);

    try {
        // Vérifier la signature du webhook avec la clé secrète du webhook
        stripeEvent = stripe.webhooks.constructEvent(
            rawBody,
            signature,
            process.env.STRIPE_CONNECT_WEBHOOK_SECRET
        );
        console.log('✅ Signature Stripe valide pour l\'événement:', stripeEvent.id);
    } catch (err) {
        console.error('❌ Erreur de signature du webhook:', err.message);
        console.error('Détails:', { 
            signatureLength: signature.length,
            webhookSecretLength: process.env.STRIPE_CONNECT_WEBHOOK_SECRET?.length || 0,
            bodySnippet: rawBody.substring(0, 50) + '...'
        });
        return {
            statusCode: 400,
            body: JSON.stringify({ error: `Erreur de signature du webhook: ${err.message}` })
        };
    }

    console.log(`🎉 Événement Stripe reçu: ${stripeEvent.type} [${stripeEvent.id}]`);
    
    if (stripeEvent.data && stripeEvent.data.object) {
        console.log('📄 Données de l\'événement:', JSON.stringify({
            id: stripeEvent.data.object.id,
            object: stripeEvent.data.object.object,
            created: stripeEvent.data.object.created,
            livemode: stripeEvent.livemode,
            // Log minimal des données pour éviter de surcharger les logs
            ...(stripeEvent.data.object.charges_enabled !== undefined && { charges_enabled: stripeEvent.data.object.charges_enabled }),
            ...(stripeEvent.data.object.payouts_enabled !== undefined && { payouts_enabled: stripeEvent.data.object.payouts_enabled }),
            ...(stripeEvent.data.object.details_submitted !== undefined && { details_submitted: stripeEvent.data.object.details_submitted }),
            ...(stripeEvent.data.object.status !== undefined && { status: stripeEvent.data.object.status }),
            ...(stripeEvent.data.object.application_fee_amount !== undefined && { application_fee_amount: stripeEvent.data.object.application_fee_amount }),
            ...(stripeEvent.data.object.amount !== undefined && { amount: stripeEvent.data.object.amount }),
            ...(stripeEvent.data.object.metadata !== undefined && { metadata: stripeEvent.data.object.metadata })
        }));
    }

    // Traiter les différents types d'événements
    try {
        let result;
        switch (stripeEvent.type) {
            case 'account.updated':
                result = await handleAccountUpdated(stripeEvent.data.object);
                break;
            case 'account.application.authorized':
                result = await handleAccountAuthorized(stripeEvent.data.object);
                break;
            case 'account.application.deauthorized':
                result = await handleAccountDeauthorized(stripeEvent.data.object);
                break;
                
            // Événements de paiement
            case 'payment_intent.succeeded':
                result = await handlePaymentIntentSucceeded(stripeEvent.data.object);
                break;
            case 'payment_intent.payment_failed':
                result = await handlePaymentIntentFailed(stripeEvent.data.object);
                break;
                
            // Événements de transfert pour Connect
            case 'transfer.created':
                console.log('💸 Transfert créé vers un compte Connect');
                result = { status: 'transfer_created', action: 'logged' };
                break;
            case 'transfer.paid':
                console.log('💰 Transfert payé au compte Connect');
                result = { status: 'transfer_paid', action: 'logged' };
                break;
                
            // Événements de commission
            case 'application_fee.created':
                console.log('💵 Commission de plateforme créée');
                result = { status: 'fee_created', action: 'logged' };
                break;
            case 'application_fee.paid':
                console.log('💵 Commission de plateforme payée');
                result = { status: 'fee_paid', action: 'logged' };
                break;
                
            // Ajouter des événements spécifiques au onboarding
            case 'account.external_account.created':
                console.log('💳 Compte bancaire ajouté');
                result = { status: 'bank_account_added', action: 'logged' };
                break;
            case 'account.external_account.updated':
                console.log('💳 Compte bancaire mis à jour');
                result = { status: 'bank_account_updated', action: 'logged' };
                break;
                
            // Autres événements à traiter selon les besoins
            default:
                console.log(`ℹ️ Événement non traité: ${stripeEvent.type}`);
                result = { status: 'unhandled', action: 'ignored' };
        }

        console.log('✅ Traitement terminé:', result);
        
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                received: true,
                event_id: stripeEvent.id,
                event_type: stripeEvent.type,
                processing_result: result
            })
        };
    } catch (err) {
        console.error(`❌ Erreur lors du traitement de l'événement ${stripeEvent.type}:`, err.message);
        console.error('Stack trace:', err.stack);
        
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                error: `Erreur lors du traitement de l'événement: ${err.message}`,
                event_id: stripeEvent.id,
                event_type: stripeEvent.type
            })
        };
    }
};

/**
 * Gère la mise à jour d'un compte Stripe Connect
 */
async function handleAccountUpdated(account) {
    const accountId = account.id;
    
    console.log(`🔄 Traitement de la mise à jour du compte ${accountId}`);
    console.log('📊 État du compte:', { 
        charges_enabled: account.charges_enabled, 
        payouts_enabled: account.payouts_enabled,
        details_submitted: account.details_submitted,
        requirements: account.requirements ? {
            currently_due_count: account.requirements.currently_due?.length || 0,
            eventually_due_count: account.requirements.eventually_due?.length || 0,
            past_due_count: account.requirements.past_due?.length || 0
        } : 'non disponible'
    });
    
    // Vérification détaillée pour déterminer le statut
    let status = 'onboarding'; // État par défaut
    let statusReason = 'État initial (onboarding)';
    
    if (account.details_submitted) {
        if (account.charges_enabled && account.payouts_enabled) {
            status = 'active';
            statusReason = 'Compte complètement vérifié (charges + payouts activés)';
        } else {
            status = 'pending_verification';
            statusReason = 'Informations soumises mais vérification en attente';
        }
    } else {
        statusReason = 'Informations du compte non soumises';
    }
    
    console.log(`🏷️ Nouveau statut déterminé: ${status} (${statusReason})`);
    
    // Vérifier si le compte existe dans Supabase avant la mise à jour
    const { data: existingAccount, error: fetchError } = await supabase
        .from('stripe_connect_accounts')
        .select('account_status, charges_enabled, payouts_enabled, details_submitted')
        .eq('stripe_account_id', accountId)
        .maybeSingle();
    
    if (fetchError) {
        console.error('❌ Erreur lors de la recherche du compte dans Supabase:', fetchError);
        throw new Error(`Erreur de recherche Supabase: ${fetchError.message}`);
    }
    
    if (!existingAccount) {
        console.warn(`⚠️ Compte ${accountId} introuvable dans Supabase, impossible de mettre à jour`);
        return { status: 'account_not_found', action: 'skipped' };
    }
    
    console.log('💾 État actuel dans Supabase:', existingAccount);
    
    // Si aucun changement significatif, éviter la mise à jour
    if (existingAccount.account_status === status &&
        existingAccount.charges_enabled === account.charges_enabled &&
        existingAccount.payouts_enabled === account.payouts_enabled &&
        existingAccount.details_submitted === account.details_submitted) {
        console.log('ℹ️ Aucun changement significatif détecté, mise à jour ignorée');
        return { status: 'unchanged', action: 'skipped' };
    }
    
    // Mettre à jour le statut dans Supabase
    const updateData = {
        account_status: status,
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
        details_submitted: account.details_submitted,
        updated_at: new Date().toISOString(),
        last_webhook_received_at: new Date().toISOString()
    };
    
    console.log('📝 Données à mettre à jour:', updateData);
    
    const { error: updateError } = await supabase
        .from('stripe_connect_accounts')
        .update(updateData)
        .eq('stripe_account_id', accountId);
    
    if (updateError) {
        console.error('❌ Erreur lors de la mise à jour dans Supabase:', updateError);
        console.error('Détails de l\'erreur:', JSON.stringify(updateError));
        throw new Error(`Erreur de mise à jour Supabase: ${updateError.message}`);
    }
    
    console.log(`✅ Compte ${accountId} mis à jour avec succès dans Supabase avec le statut: ${status}`);
    return { status, action: 'updated', previous_status: existingAccount.account_status };
}

/**
 * Gère l'autorisation d'un compte Stripe Connect
 */
async function handleAccountAuthorized(account) {
    const accountId = account.id;
    
    console.log(`🔑 Compte ${accountId} autorisé`);
    
    // Mettre à jour le statut dans Supabase
    const { data, error } = await supabase
        .from('stripe_connect_accounts')
        .update({
            account_status: 'authorized',
            updated_at: new Date().toISOString(),
            last_webhook_received_at: new Date().toISOString()
        })
        .eq('stripe_account_id', accountId)
        .select('account_status');
    
    if (error) {
        console.error('❌ Erreur lors de la mise à jour du statut authorized:', error);
        throw new Error(`Erreur de mise à jour Supabase: ${error.message}`);
    }
    
    console.log(`✅ Statut 'authorized' mis à jour pour le compte ${accountId}`);
    return { status: 'authorized', action: 'updated', data };
}

/**
 * Gère la déautorisation d'un compte Stripe Connect
 */
async function handleAccountDeauthorized(account) {
    const accountId = account.id;
    
    console.log(`🚫 Compte ${accountId} déautorisé`);
    
    // Mettre à jour le statut dans Supabase
    const { data, error } = await supabase
        .from('stripe_connect_accounts')
        .update({
            account_status: 'deauthorized',
            updated_at: new Date().toISOString(),
            last_webhook_received_at: new Date().toISOString()
        })
        .eq('stripe_account_id', accountId)
        .select('account_status');
    
    if (error) {
        console.error('❌ Erreur lors de la mise à jour du statut deauthorized:', error);
        throw new Error(`Erreur de mise à jour Supabase: ${error.message}`);
    }
    
    console.log(`✅ Statut 'deauthorized' mis à jour pour le compte ${accountId}`);
    return { status: 'deauthorized', action: 'updated', data };
}

/**
 * Gère un paiement réussi avec Stripe Connect
 */
async function handlePaymentIntentSucceeded(paymentIntent) {
    console.log(`💰 Paiement réussi: ${paymentIntent.id}`);

    // Vérifier si c'est un paiement avec Connect en vérifiant la présence de transfer_data
    const isConnectPayment = paymentIntent.transfer_data && paymentIntent.transfer_data.destination;
    const applicationFeeAmount = paymentIntent.application_fee_amount || 0;
    const connectAccountId = isConnectPayment ? paymentIntent.transfer_data.destination : null;

    console.log('📊 Détails du paiement:', {
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        isConnectPayment,
        connectAccountId,
        applicationFeeAmount,
        status: paymentIntent.status
    });

    // Extraire les métadonnées
    const metadata = paymentIntent.metadata || {};
    console.log('📝 Métadonnées du paiement:', metadata);

    // Si c'est un paiement avec Connect, on peut enregistrer des statistiques
    if (isConnectPayment && connectAccountId) {
        try {
            // Récupérer l'ID d'association à partir des métadonnées
            const associationId = metadata.association_id;
            if (!associationId) {
                console.warn('⚠️ ID d\'association manquant dans les métadonnées');
                return { status: 'success', action: 'logged', isConnectPayment, hasAssociationId: false };
            }

            console.log(`🔄 Mise à jour des statistiques pour l'association ${associationId}`);

            // Récupérer les statistiques actuelles depuis Supabase
            const { data: statsData, error: statsError } = await supabase
                .from('stripe_connect_stats')
                .select('*')
                .eq('association_id', associationId)
                .single();

            if (statsError && statsError.code !== 'PGRST116') { // PGRST116 = not found
                console.error('❌ Erreur lors de la récupération des statistiques:', statsError);
                throw new Error(`Erreur de récupération des statistiques: ${statsError.message}`);
            }

            // Préparer les nouvelles statistiques
            const now = new Date().toISOString();
            let newStats = {
                total_payments: 1,
                total_amount: paymentIntent.amount,
                total_fees: applicationFeeAmount,
                last_payment_at: now,
                updated_at: now
            };

            // Si les stats existent déjà, on les met à jour
            if (statsData) {
                newStats = {
                    total_payments: (statsData.total_payments || 0) + 1,
                    total_amount: (statsData.total_amount || 0) + paymentIntent.amount,
                    total_fees: (statsData.total_fees || 0) + applicationFeeAmount,
                    last_payment_at: now,
                    updated_at: now
                };
            }

            // Mettre à jour ou insérer les statistiques
            const { error: upsertError } = await supabase
                .from('stripe_connect_stats')
                .upsert({
                    association_id: associationId,
                    stripe_account_id: connectAccountId,
                    ...newStats
                });

            if (upsertError) {
                console.error('❌ Erreur lors de la mise à jour des statistiques:', upsertError);
                throw new Error(`Erreur de mise à jour des statistiques: ${upsertError.message}`);
            }

            console.log('✅ Statistiques mises à jour avec succès');
            return { 
                status: 'success', 
                action: 'stats_updated', 
                isConnectPayment, 
                hasAssociationId: true 
            };
        } catch (error) {
            console.error('❌ Erreur lors du traitement des statistiques:', error.message);
            return { status: 'error', action: 'stats_failed', error: error.message };
        }
    }

    return { status: 'success', action: 'logged', isConnectPayment };
}

/**
 * Gère un échec de paiement avec Stripe Connect
 */
async function handlePaymentIntentFailed(paymentIntent) {
    console.log(`❌ Paiement échoué: ${paymentIntent.id}`);
    console.log(`📊 Détails: ${paymentIntent.last_payment_error?.message || 'Pas de détails d\'erreur'}`);

    // Vérifier si c'est un paiement avec Connect
    const isConnectPayment = paymentIntent.transfer_data && paymentIntent.transfer_data.destination;
    const connectAccountId = isConnectPayment ? paymentIntent.transfer_data.destination : null;

    console.log('📝 Échec de paiement:', {
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        isConnectPayment,
        connectAccountId,
        status: paymentIntent.status,
        errorCode: paymentIntent.last_payment_error?.code,
        errorMessage: paymentIntent.last_payment_error?.message
    });

    return { status: 'failed', action: 'logged', isConnectPayment };
} 