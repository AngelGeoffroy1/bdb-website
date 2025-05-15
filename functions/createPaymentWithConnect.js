const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

// Initialisation du client Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

exports.handler = async (event) => {
    // Vérification des clés Stripe
    if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_PUBLIC_KEY) {
        console.error('❌ Configuration Stripe manquante');
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
            amount,          // Montant total (base + frais)
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
            quantity,
            association_id,
            type
        });

        // Validations
        if (!amount || !base_amount) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Les montants sont requis' })
            };
        }

        if (!association_id) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'L\'ID de l\'association est requis' })
            };
        }

        // Vérifier que amount = base_amount + fee_amount
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

        // Récupérer le compte Connect de l'association
        console.log('🔄 Récupération du compte Stripe Connect de l\'association...');
        const { data: connectAccount, error: connectError } = await supabase
            .from('stripe_connect_accounts')
            .select('*')
            .eq('association_id', association_id)
            .eq('account_status', 'active')
            .single();

        if (connectError || !connectAccount) {
            console.error('❌ Erreur ou compte non trouvé:', connectError || 'Compte non trouvé');
            return {
                statusCode: 404,
                body: JSON.stringify({ 
                    error: 'Compte Stripe Connect non trouvé ou inactif',
                    details: connectError ? connectError.message : 'L\'association n\'a pas de compte Stripe Connect actif'
                })
            };
        }

        console.log('✅ Compte Connect trouvé:', {
            account_id: connectAccount.stripe_account_id,
            status: connectAccount.account_status,
            charges_enabled: connectAccount.charges_enabled,
            payouts_enabled: connectAccount.payouts_enabled
        });

        // Vérifier que le compte est bien actif
        if (!connectAccount.charges_enabled) {
            return {
                statusCode: 400,
                body: JSON.stringify({ 
                    error: 'Compte Connect non activé pour les paiements',
                    details: 'Le compte de cette association ne peut pas encore recevoir de paiements'
                })
            };
        }

        // Créer ou récupérer un client Stripe
        console.log('🔄 Création du client Stripe...');
        const customer = await stripe.customers.create({
            email: customer_email,
            name: `${firstName} ${lastName}`,
            phone: customer_phone,
            metadata: {
                event_id,
                quantity: quantity.toString(),
                association_id,
                environment: process.env.STRIPE_SECRET_KEY.startsWith('sk_live') ? 'production' : 'test'
            }
        });

        // Créer une ephemeral key pour ce client
        const ephemeralKey = await stripe.ephemeralKeys.create(
            { customer: customer.id },
            { apiVersion: '2023-10-16' } // Version la plus récente et stable
        );

        // Créer le PaymentIntent avec le compte Connect et application_fee_amount
        console.log('🔄 Création du PaymentIntent avec Connect...');
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(amount), // Montant total incluant la commission
            currency,
            customer: customer.id,
            automatic_payment_methods: {
                enabled: true,
            },
            application_fee_amount: Math.round(fee_amount), // Montant de la commission
            transfer_data: {
                destination: connectAccount.stripe_account_id, // Compte Connect de destination
            },
            metadata: {
                event_id,
                quantity: quantity.toString(),
                customer_email,
                customer_name: `${firstName} ${lastName}`,
                association_id,
                base_amount: base_amount.toString(),
                fee_amount: fee_amount.toString(),
                platform_fee_percentage: platform_fee_percentage.toString(),
                connect_account_id: connectAccount.stripe_account_id,
                payment_type: type,
                environment: process.env.STRIPE_SECRET_KEY.startsWith('sk_live') ? 'production' : 'test'
            },
            receipt_email: customer_email, // Envoi automatique du reçu
            statement_descriptor: 'BDB EVENT', // Description sur le relevé bancaire
            statement_descriptor_suffix: event_id.substring(0, 8) // Suffixe sur le relevé bancaire
        });

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
            associationId: association_id,
            connectAccountId: connectAccount.stripe_account_id,
            amount: paymentIntent.amount,
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