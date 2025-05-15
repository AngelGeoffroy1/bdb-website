const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

// Initialisation du client Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

exports.handler = async (event) => {
    // Vérification des clés Stripe
    if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_PUBLIC_KEY) {
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Configuration Stripe manquante',
                details: 'Les clés API Stripe ne sont pas correctement configurées'
            })
        };
    }

    // Log détaillé des variables d'environnement (masqués pour la production)
    console.log('Environnement Stripe:', {
        mode: process.env.STRIPE_SECRET_KEY.startsWith('sk_live') ? 'production' : 'test',
        hasSecretKey: !!process.env.STRIPE_SECRET_KEY,
        hasPublicKey: !!process.env.STRIPE_PUBLIC_KEY
    });

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Méthode non autorisée' })
        };
    }

    try {
        const {
            amount,          // Montant total incluant les frais
            base_amount,     // Montant de base pour l'association
            fee_amount,      // Frais pour la plateforme
            platform_fee_percentage, // Pourcentage des frais
            currency = 'eur',
            customer_email,
            firstName,
            lastName,
            customer_phone,
            event_id,
            quantity,
            association_id,
            type = 'standard' // 'standard' ou 'nightclub'
        } = JSON.parse(event.body);

        console.log('📝 Paramètres de paiement reçus:', {
            amount,
            base_amount,
            fee_amount,
            platform_fee_percentage,
            event_id,
            association_id,
            type
        });

        if (!amount) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Le montant est requis' })
            };
        }

        // Si le montant de base et les frais sont spécifiés, vérifier la cohérence
        if (base_amount !== undefined && fee_amount !== undefined) {
            const totalAmount = base_amount + fee_amount;
            if (Math.abs(amount - totalAmount) > 1) { // Tolérance de 1 centime pour les erreurs d'arrondi
                console.error('❌ Incohérence dans les montants:', { amount, base_amount, fee_amount, totalAmount });
                return {
                    statusCode: 400,
                    body: JSON.stringify({ 
                        error: 'Incohérence dans les montants',
                        details: `Le montant total (${amount}) ne correspond pas à la somme du montant de base (${base_amount}) et des frais (${fee_amount})`
                    })
                };
            }
        }

        // Si un ID d'association est spécifié, vérifier s'il existe un compte Connect
        let useConnectAccount = false;
        let connectAccount = null;

        if (association_id) {
            console.log('🔍 Vérification du compte Stripe Connect pour l\'association:', association_id);
            
            const { data: accountData, error: accountError } = await supabase
                .from('stripe_connect_accounts')
                .select('*')
                .eq('association_id', association_id)
                .eq('account_status', 'active')
                .single();
                
            if (!accountError && accountData && accountData.charges_enabled) {
                connectAccount = accountData;
                useConnectAccount = true;
                console.log('✅ Compte Connect actif trouvé, utilisation du mode Connect');
            } else {
                console.log('ℹ️ Pas de compte Connect actif, utilisation du mode standard');
                if (accountError) {
                    console.log('📝 Erreur de recherche:', accountError.message);
                }
            }
        }

        // Créer ou récupérer un client Stripe
        const customer = await stripe.customers.create({
            email: customer_email,
            name: `${firstName} ${lastName}`,
            phone: customer_phone,
            metadata: {
                event_id,
                quantity: quantity ? quantity.toString() : '1',
                association_id: association_id || '',
                environment: process.env.STRIPE_SECRET_KEY.startsWith('sk_live') ? 'production' : 'test'
            }
        });

        // Créer une ephemeral key pour ce client
        const ephemeralKey = await stripe.ephemeralKeys.create(
            { customer: customer.id },
            { apiVersion: '2023-10-16' } // Version la plus récente et stable
        );

        // Paramètres de base du PaymentIntent
        const paymentIntentParams = {
            amount: Math.round(amount),
            currency,
            customer: customer.id,
            automatic_payment_methods: {
                enabled: true,
            },
            metadata: {
                event_id,
                quantity: quantity ? quantity.toString() : '1',
                customer_email,
                customer_name: `${firstName} ${lastName}`,
                association_id: association_id || '',
                environment: process.env.STRIPE_SECRET_KEY.startsWith('sk_live') ? 'production' : 'test'
            },
            receipt_email: customer_email, // Envoi automatique du reçu
            statement_descriptor: 'BDB EVENT', // Description sur le relevé bancaire
            statement_descriptor_suffix: event_id ? event_id.substring(0, 8) : 'TICKET' // Suffixe sur le relevé bancaire
        };

        // Ajouter les informations de commission si nous utilisons Connect
        if (useConnectAccount && connectAccount && fee_amount) {
            paymentIntentParams.application_fee_amount = Math.round(fee_amount);
            paymentIntentParams.transfer_data = {
                destination: connectAccount.stripe_account_id,
            };
            
            // Ajouter des métadonnées supplémentaires pour Connect
            paymentIntentParams.metadata.base_amount = base_amount ? base_amount.toString() : amount.toString();
            paymentIntentParams.metadata.fee_amount = fee_amount.toString();
            paymentIntentParams.metadata.platform_fee_percentage = platform_fee_percentage ? platform_fee_percentage.toString() : '0';
            paymentIntentParams.metadata.connect_account_id = connectAccount.stripe_account_id;
            paymentIntentParams.metadata.payment_type = type;
            
            console.log('💳 Création du PaymentIntent avec Connect:', {
                amount: paymentIntentParams.amount,
                fee: paymentIntentParams.application_fee_amount,
                destination: connectAccount.stripe_account_id
            });
        } else {
            console.log('💳 Création du PaymentIntent standard');
        }

        // Créer le PaymentIntent
        const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams);

        const response = {
            client_secret: paymentIntent.client_secret,
            publishable_key: process.env.STRIPE_PUBLIC_KEY,
            customer_id: customer.id,
            ephemeral_key: ephemeralKey.secret
        };

        // Log sécurisé pour la production
        console.log('✅ Transaction initiée:', {
            paymentIntentId: paymentIntent.id,
            customerId: customer.id,
            amount: paymentIntent.amount,
            useConnectAccount,
            connectAccountId: useConnectAccount ? connectAccount.stripe_account_id : null,
            applicationFee: paymentIntent.application_fee_amount,
            currency: paymentIntent.currency,
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
        // Log d'erreur sécurisé pour la production
        console.error('❌ Erreur de transaction:', {
            message: error.message,
            type: error.type,
            code: error.code,
            environment: process.env.STRIPE_SECRET_KEY.startsWith('sk_live') ? 'production' : 'test'
        });

        return {
            statusCode: error.statusCode || 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                error: error.message || 'Erreur lors de la création du paiement',
                type: error.type,
                code: error.code
            })
        };
    }
}; 