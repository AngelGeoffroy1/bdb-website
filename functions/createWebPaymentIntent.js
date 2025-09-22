const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

// Initialisation du client Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const parseNullableInt = (value) => {
    if (value === null || value === undefined) {
        return null;
    }
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
};

const parseNullableNumber = (value) => {
    if (value === null || value === undefined) {
        return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const resolveRemainingQuantity = (ticketType = {}) => {
    const candidates = [
        ticketType.remaining_quantity,
        ticketType.quantity_remaining,
        ticketType.available_quantity,
        ticketType.stock_remaining,
        ticketType.stock,
        ticketType.remaining,
        ticketType.quantity
    ];

    for (const candidate of candidates) {
        const parsed = parseNullableInt(candidate);
        if (parsed !== null) {
            return parsed;
        }
    }

    return null;
};

exports.handler = async (event) => {
    console.log('💳 Fonction createWebPaymentIntent appelée');

    // Vérifier la méthode HTTP
    if (event.httpMethod !== 'POST') {
        console.log('❌ Méthode HTTP non autorisée:', event.httpMethod);
        return {
            statusCode: 405,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            body: JSON.stringify({ error: 'Méthode non autorisée' })
        };
    }

    // Gestion des requêtes OPTIONS pour CORS
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            body: ''
        };
    }

    try {
        // Récupérer les données de la requête
        const payload = JSON.parse(event.body);
        const event_id = payload.event_id;
        const ticket_type_id = payload.ticket_type_id || null;
        const quantity = parseNullableInt(payload.quantity);
        const customerInfo = payload.customerInfo;

        console.log('📝 Données reçues:', { event_id, quantity, ticket_type_id, customerInfo });

        // Validation des paramètres
        if (!event_id || !quantity || !customerInfo) {
            console.log('❌ Paramètres manquants');
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS'
                },
                body: JSON.stringify({ error: 'Paramètres manquants' })
            };
        }

        if (quantity <= 0) {
            console.log('❌ Quantité invalide:', quantity);
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS'
                },
                body: JSON.stringify({ error: 'La quantité doit être supérieure à zéro' })
            };
        }

        if (!customerInfo.firstName || !customerInfo.lastName || !customerInfo.email) {
            console.log('❌ Informations client incomplètes');
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS'
                },
                body: JSON.stringify({ error: 'Informations client incomplètes' })
            };
        }

        // Récupérer les informations de l'événement
        console.log('🔄 Récupération des informations de l\'événement...');
        const { data: eventData, error: eventError } = await supabase
            .from('events')
            .select(`
                id,
                name,
                price,
                platform_fee,
                available_tickets,
                association_id,
                associations (
                    name
                )
            `)
            .eq('id', event_id)
            .single();

        if (eventError || !eventData) {
            console.error('❌ Événement non trouvé:', eventError);
            return {
                statusCode: 404,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS'
                },
                body: JSON.stringify({ error: 'Événement non trouvé' })
            };
        }

        console.log('✅ Événement trouvé:', eventData.name);

        const eventAvailable = parseNullableInt(eventData.available_tickets);
        if (eventAvailable !== null && quantity > eventAvailable) {
            console.log('❌ Quantité demandée supérieure aux billets restants pour l\'événement', {
                quantityDemanded: quantity,
                available: eventAvailable
            });
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS'
                },
                body: JSON.stringify({ error: 'Il ne reste plus assez de billets pour cet événement.' })
            };
        }

        let unitPrice = parseNullableNumber(eventData.price);
        let ticketTypeName = null;
        let ticketTypeLimit = null;
        let ticketTypeRemaining = null;
        let ticketTypePerOrderLimit = null;

        if (ticket_type_id) {
            console.log('🎟️ Récupération du type de billet sélectionné…', ticket_type_id);
            const { data: ticketTypeData, error: ticketTypeError } = await supabase
                .from('event_ticket_types')
                .select('*')
                .eq('id', ticket_type_id)
                .eq('event_id', event_id)
                .single();

            if (ticketTypeError || !ticketTypeData) {
                console.error('❌ Type de billet introuvable ou invalide:', ticketTypeError);
                return {
                    statusCode: 400,
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Headers': 'Content-Type',
                        'Access-Control-Allow-Methods': 'POST, OPTIONS'
                    },
                    body: JSON.stringify({ error: 'Le type de billet sélectionné est invalide.' })
                };
            }

            const ticketPrice = parseNullableNumber(ticketTypeData.price);
            if (ticketPrice === null) {
                return {
                    statusCode: 400,
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Headers': 'Content-Type',
                        'Access-Control-Allow-Methods': 'POST, OPTIONS'
                    },
                    body: JSON.stringify({ error: 'Le prix du billet sélectionné est invalide.' })
                };
            }

            unitPrice = ticketPrice;
            ticketTypeName = ticketTypeData.name || 'Billet';
            ticketTypeLimit = parseNullableInt(
                ticketTypeData.limit_per_order ??
                ticketTypeData.order_limit ??
                ticketTypeData.max_per_order ??
                ticketTypeData.quantity_limit_per_order
            );
            ticketTypePerOrderLimit = ticketTypeLimit;
            ticketTypeRemaining = resolveRemainingQuantity(ticketTypeData);

            if (ticketTypeRemaining === null) {
                const quantityFromSchema = parseNullableInt(ticketTypeData.quantity_limit);
                if (quantityFromSchema !== null) {
                    ticketTypeRemaining = quantityFromSchema;
                }
            }

            if (ticketTypeLimit !== null && quantity > ticketTypeLimit) {
                console.log('❌ Quantité demandée supérieure à la limite par commande pour ce type de billet', {
                    quantityDemanded: quantity,
                    limit: ticketTypeLimit
                });
                return {
                    statusCode: 400,
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Headers': 'Content-Type',
                        'Access-Control-Allow-Methods': 'POST, OPTIONS'
                    },
                    body: JSON.stringify({ error: 'Vous avez dépassé la quantité autorisée par commande pour ce billet.' })
                };
            }

            if (ticketTypeRemaining !== null && quantity > ticketTypeRemaining) {
                console.log('❌ Quantité demandée supérieure au stock restant pour ce type de billet', {
                    quantityDemanded: quantity,
                    remaining: ticketTypeRemaining
                });
                return {
                    statusCode: 400,
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Headers': 'Content-Type',
                        'Access-Control-Allow-Methods': 'POST, OPTIONS'
                    },
                    body: JSON.stringify({ error: 'Il ne reste plus assez de billets de ce type.' })
                };
            }

            console.log('🎟️ Type de billet confirmé:', {
                ticket_type_id,
                ticketTypeName,
                ticketPrice,
                ticketTypePerOrderLimit,
                ticketTypeRemaining
            });
        }

        if (unitPrice === null) {
            console.log('❌ Prix de billet indisponible pour l\'événement');
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS'
                },
                body: JSON.stringify({ error: 'Le prix du billet est introuvable.' })
            };
        }

        const feePercentage = parseNullableNumber(eventData.platform_fee) ?? 5;
        const unitPriceCents = Math.round(unitPrice * 100);
        const unitFeeCents = Math.round(unitPriceCents * feePercentage / 100);
        const unitTotalCents = unitPriceCents + unitFeeCents;

        if (unitTotalCents <= 0) {
            console.log('❌ Montant total invalide pour Stripe', { unitPrice, feePercentage, unitTotalCents });
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS'
                },
                body: JSON.stringify({ error: 'Le montant du billet sélectionné est invalide.' })
            };
        }

        const baseAmountCents = unitPriceCents * quantity;
        const feeAmountCents = unitFeeCents * quantity;
        const totalAmountCents = unitTotalCents * quantity;

        const baseAmount = baseAmountCents / 100;
        const feeAmount = feeAmountCents / 100;
        const totalAmount = totalAmountCents / 100;

        console.log('💰 Calcul des montants:', {
            unitPrice,
            feePercentage,
            quantity,
            unitFee: unitFeeCents / 100,
            baseAmount,
            feeAmount,
            totalAmount,
            ticket_type_id,
            ticket_type_order_limit: ticketTypePerOrderLimit
        });

        // Vérifier si on doit utiliser Stripe Connect
        let useConnectAccount = false;
        let connectAccount = null;

        if (eventData.association_id) {
            console.log('🔍 Vérification du compte Stripe Connect pour l\'association:', eventData.association_id);
            
            const { data: accountData, error: accountError } = await supabase
                .from('stripe_connect_accounts')
                .select('*')
                .eq('association_id', eventData.association_id)
                .eq('account_status', 'active')
                .single();
                
            if (!accountError && accountData && accountData.charges_enabled) {
                connectAccount = accountData;
                useConnectAccount = true;
                console.log('✅ Compte Connect actif trouvé, utilisation du mode Connect');
            } else {
                console.log('ℹ️ Pas de compte Connect actif, utilisation du mode standard');
            }
        }

        // Créer ou récupérer un client Stripe
        console.log('👤 Création/récupération du client Stripe...');
        let customer;
        
        try {
            // Essayer de trouver un client existant par email
            const existingCustomers = await stripe.customers.list({
                email: customerInfo.email,
                limit: 1
            });

            if (existingCustomers.data.length > 0) {
                customer = existingCustomers.data[0];
                console.log('✅ Client existant trouvé:', customer.id);
            } else {
                // Créer un nouveau client
                customer = await stripe.customers.create({
                    email: customerInfo.email,
                    name: `${customerInfo.firstName} ${customerInfo.lastName}`,
                    phone: customerInfo.phone || undefined,
                    metadata: {
                        source: 'bdb_web',
                        event_id: String(event_id),
                        ticket_type_id: ticket_type_id ? String(ticket_type_id) : ''
                    }
                });
                console.log('✅ Nouveau client créé:', customer.id);
            }
        } catch (customerError) {
            console.error('❌ Erreur lors de la création du client:', customerError);
            return {
                statusCode: 500,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS'
                },
                body: JSON.stringify({ error: 'Erreur lors de la création du client' })
            };
        }

        // Créer la session Stripe Checkout
        console.log('🛒 Création de la session Stripe Checkout...');
        
        const productName = ticketTypeName ? `${eventData.name} - ${ticketTypeName}` : `${eventData.name} - Ticket`;
        const productDescription = ticketTypeName
            ? `${quantity} × ${ticketTypeName} pour l'événement "${eventData.name}"`
            : `${quantity} ticket(s) pour l'événement "${eventData.name}"`;

        const stripeMetadata = {
            event_id: String(event_id),
            quantity: quantity.toString(),
            customer_email: customerInfo.email,
            customer_name: `${customerInfo.firstName} ${customerInfo.lastName}`,
            customer_phone: customerInfo.phone || '',
            customer_password: customerInfo.password || '',
            association_id: eventData.association_id ? String(eventData.association_id) : '',
            base_amount: baseAmount.toFixed(2),
            fee_amount: feeAmount.toFixed(2),
            platform_fee_percentage: String(feePercentage),
            ticket_unit_amount: (unitPriceCents / 100).toFixed(2),
            ticket_unit_fee: (unitFeeCents / 100).toFixed(2),
            source: 'bdb_web'
        };

        if (ticket_type_id) {
            console.log('🎟️ Ajout du ticket_type_id aux métadonnées Stripe:', ticket_type_id);
            stripeMetadata.ticket_type_id = String(ticket_type_id);
            stripeMetadata.ticket_type_name = ticketTypeName || '';
            if (ticketTypePerOrderLimit !== null) {
                stripeMetadata.ticket_type_limit = ticketTypePerOrderLimit.toString();
            }
            if (ticketTypeRemaining !== null) {
                stripeMetadata.ticket_type_remaining = ticketTypeRemaining.toString();
            }
        } else {
            console.log('ℹ️ Aucun ticket_type_id à ajouter aux métadonnées');
        }

        const paymentIntentMetadata = {
            ...stripeMetadata,
            environment: process.env.STRIPE_SECRET_KEY.startsWith('sk_live') ? 'production' : 'test'
        };

        const productMetadata = {
            event_id: String(event_id),
            association_id: eventData.association_id ? String(eventData.association_id) : ''
        };

        if (ticket_type_id) {
            productMetadata.ticket_type_id = String(ticket_type_id);
            if (ticketTypeName) {
                productMetadata.ticket_type_name = ticketTypeName;
            }
        }

        const sessionParams = {
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'eur',
                        product_data: {
                            name: productName,
                            description: productDescription,
                            metadata: productMetadata
                        },
                        unit_amount: unitTotalCents
                    },
                    quantity: quantity
                }
            ],
            mode: 'payment',
            customer: customer.id,
            success_url: `${event.headers.origin || 'https://bureaudesbureaux.com'}/paiement-success.html?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${event.headers.origin || 'https://bureaudesbureaux.com'}/paiement.html?id=${event_id}`,
            metadata: stripeMetadata,
            payment_intent_data: {
                metadata: paymentIntentMetadata
            }
        };

        // Ajouter les paramètres Stripe Connect si nécessaire
        if (useConnectAccount && connectAccount && feeAmountCents > 0) {
            sessionParams.payment_intent_data.application_fee_amount = feeAmountCents;
            sessionParams.payment_intent_data.transfer_data = {
                destination: connectAccount.stripe_account_id
            };
            
            // Ajouter des métadonnées supplémentaires pour Connect
            sessionParams.payment_intent_data.metadata.connect_account_id = connectAccount.stripe_account_id;
            sessionParams.payment_intent_data.metadata.payment_type = 'web_connect';
            
            console.log('💳 Session créée avec Stripe Connect:', {
                destination: connectAccount.stripe_account_id,
                application_fee: feeAmount
            });
        } else {
            console.log('💳 Session créée en mode standard');
        }

        const session = await stripe.checkout.sessions.create(sessionParams);

        console.log('✅ Session Stripe Checkout créée:', session.id);

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                sessionId: session.id,
                customerId: customer.id,
                totalAmount: totalAmount,
                useConnect: useConnectAccount
            })
        };

    } catch (error) {
        console.error('❌ Erreur inattendue:', error);
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            body: JSON.stringify({ 
                error: 'Erreur interne du serveur',
                details: error.message
            })
        };
    }
};
