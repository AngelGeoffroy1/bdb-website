const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Méthode non autorisée' };
    }

    const sig = event.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET; // À configurer dans Netlify

    let stripeEvent;

    try {
        // Vérification de la signature Stripe
        stripeEvent = stripe.webhooks.constructEvent(
            event.body,
            sig,
            endpointSecret
        );
    } catch (err) {
        console.error('Erreur de signature webhook:', err.message);
        return {
            statusCode: 400,
            body: `Erreur de signature webhook: ${err.message}`
        };
    }

    // Log sécurisé de l'événement
    console.log('Webhook Stripe reçu:', {
        type: stripeEvent.type,
        id: stripeEvent.id,
        environment: stripeEvent.livemode ? 'production' : 'test'
    });

    try {
        switch (stripeEvent.type) {
            case 'payment_intent.succeeded':
                const paymentIntent = stripeEvent.data.object;
                const metadata = paymentIntent.metadata;
                
                console.log('Paiement réussi:', {
                    paymentIntentId: paymentIntent.id,
                    amount: paymentIntent.amount,
                    customerId: paymentIntent.customer,
                    metadata: metadata
                });

                try {
                    const { createClient } = require('@supabase/supabase-js');
                    
                    // Initialisation du client Supabase
                    const supabaseUrl = process.env.SUPABASE_URL;
                    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
                    const supabase = createClient(supabaseUrl, supabaseKey);

                    const quantity = parseInt(metadata.quantity);
                    const totalAmount = paymentIntent.amount / 100; // Convertir les centimes en euros
                    const customerNames = metadata.customer_name.split(' ');
                    const firstName = customerNames[0] || '';
                    const lastName = customerNames.slice(1).join(' ') || '';

                    console.log('🎫 Création des tickets dans Supabase...', {
                        event_id: metadata.event_id,
                        quantity,
                        totalAmount,
                        customer_email: metadata.customer_email
                    });

                    // Générer un UUID unique pour cet achat web
                    const webUserId = require('crypto').randomUUID();
                    
                    // Créer un utilisateur avec les vraies informations du client
                    console.log('👤 Création d\'un utilisateur avec les informations du client...');
                    const { error: userError } = await supabase
                        .from('users')
                        .insert({
                            id: webUserId,
                            first_name: firstName,
                            last_name: lastName,
                            email: metadata.customer_email,
                            date_of_birth: '2000-01-01', // Date par défaut (obligatoire)
                            school: 'Bordeaux', // École par défaut (obligatoire)
                            study_year: 'N/A', // Année par défaut (obligatoire)
                            city: 'Bordeaux', // Ville par défaut (obligatoire)
                            phone: metadata.customer_phone || null,
                            is_admin: false,
                            is_sso_user: false,
                            is_anonymous: true // Marquer comme utilisateur web
                        });

                    if (userError) {
                        console.error('❌ Erreur lors de la création de l\'utilisateur temporaire:', userError);
                        throw new Error(`Erreur création utilisateur temporaire: ${userError.message}`);
                    }

                    console.log('✅ Utilisateur temporaire créé avec l\'ID:', webUserId);

                    // Créer les tickets (un ticket par quantité)
                    const tickets = [];
                    for (let i = 0; i < quantity; i++) {
                        const ticketData = {
                            event_id: metadata.event_id,
                            user_id: webUserId, // Utiliser l'ID de l'utilisateur temporaire créé
                            quantity: 1, // Chaque ticket représente 1 place
                            total_amount: totalAmount / quantity, // Montant unitaire
                            customer_first_name: firstName,
                            customer_last_name: lastName,
                            customer_email: metadata.customer_email,
                            customer_phone: metadata.customer_phone || null,
                            ticket_code: require('crypto').randomUUID(),
                            is_used: false,
                            is_golden: false,
                            skip_points_update: true, // Pas de mise à jour des points pour les achats web
                            purchase_date: new Date().toISOString(),
                            created_at: new Date().toISOString()
                        };
                        tickets.push(ticketData);
                    }

                    // Insérer les tickets dans Supabase
                    const { data: insertedTickets, error: ticketsError } = await supabase
                        .from('tickets')
                        .insert(tickets);

                    if (ticketsError) {
                        console.error('❌ Erreur lors de l\'insertion des tickets:', ticketsError);
                        throw new Error(`Erreur insertion tickets: ${ticketsError.message}`);
                    }

                    console.log('✅ Tickets créés avec succès:', insertedTickets?.length || quantity);

                    // Mettre à jour le nombre de tickets disponibles
                    console.log('🔄 Mise à jour des tickets disponibles...');
                    
                    // D'abord récupérer le nombre actuel de tickets disponibles
                    const { data: eventData, error: fetchError } = await supabase
                        .from('events')
                        .select('available_tickets')
                        .eq('id', metadata.event_id)
                        .single();

                    if (fetchError) {
                        console.error('❌ Erreur lors de la récupération de l\'événement:', fetchError);
                    } else {
                        const newAvailableTickets = Math.max(0, eventData.available_tickets - quantity);
                        
                        const { error: updateError } = await supabase
                            .from('events')
                            .update({ 
                                available_tickets: newAvailableTickets
                            })
                            .eq('id', metadata.event_id);

                        if (updateError) {
                            console.error('❌ Erreur lors de la mise à jour des tickets disponibles:', updateError);
                            // Ne pas faire échouer le webhook pour cette erreur
                        } else {
                            console.log('✅ Tickets disponibles mis à jour');
                        }
                    }

                    console.log('🎉 Paiement web traité avec succès');

                    // Envoyer l'email de confirmation avec les QR codes
                    try {
                        console.log('📧 Envoi de l\'email de confirmation...');
                        
                        const emailResponse = await fetch(`${process.env.URL || 'https://bureaudesbureaux.com'}/.netlify/functions/sendTicketEmail`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                sessionId: paymentIntent.id,
                                customerEmail: metadata.customer_email,
                                eventId: metadata.event_id
                            })
                        });

                        if (emailResponse.ok) {
                            console.log('✅ Email de confirmation envoyé avec succès');
                        } else {
                            console.error('❌ Erreur lors de l\'envoi de l\'email:', await emailResponse.text());
                        }
                    } catch (emailError) {
                        console.error('❌ Erreur lors de l\'envoi de l\'email:', emailError);
                        // Ne pas faire échouer le webhook pour une erreur d'email
                    }

                } catch (error) {
                    console.error('❌ Erreur lors de la création du ticket:', error);
                    // On ne renvoie pas d'erreur à Stripe pour éviter les retentatives
                }
                break;

            case 'payment_intent.payment_failed':
                const failedPayment = stripeEvent.data.object;
                console.log('Paiement échoué:', {
                    paymentIntentId: failedPayment.id,
                    error: failedPayment.last_payment_error,
                    customerId: failedPayment.customer,
                    metadata: failedPayment.metadata
                });

                try {
                    const { createClient } = require('@supabase/supabase-js');
                    
                    // Initialisation du client Supabase
                    const supabaseUrl = process.env.SUPABASE_URL;
                    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
                    const supabase = createClient(supabaseUrl, supabaseKey);

                    const eventId = failedPayment.metadata.event_id;
                    const quantity = parseInt(failedPayment.metadata.quantity);

                    console.log('🔄 Libération des places pour paiement échoué:', {
                        eventId,
                        quantity,
                        paymentIntentId: failedPayment.id
                    });

                    // Récupérer le nombre actuel de tickets disponibles
                    const { data: eventData, error: fetchError } = await supabase
                        .from('events')
                        .select('available_tickets')
                        .eq('id', eventId)
                        .single();

                    if (fetchError) {
                        console.error('❌ Erreur lors de la récupération de l\'événement:', fetchError);
                    } else {
                        // Remettre les tickets disponibles (en cas d'échec de paiement)
                        const newAvailableTickets = eventData.available_tickets + quantity;
                        
                        const { error: updateError } = await supabase
                            .from('events')
                            .update({ 
                                available_tickets: newAvailableTickets
                            })
                            .eq('id', eventId);

                        if (updateError) {
                            console.error('❌ Erreur lors de la libération des tickets:', updateError);
                        } else {
                            console.log('✅ Tickets libérés avec succès');
                        }
                    }

                    // Envoyer une notification d'échec
                    // TODO: Implémenter l'envoi de notification
                    console.log('Notification d\'échec à envoyer à:', failedPayment.metadata.customer_email);

                } catch (error) {
                    console.error('Erreur lors du traitement de l\'échec:', error);
                }
                break;

            case 'charge.dispute.created':
                const dispute = stripeEvent.data.object;
                console.log('Dispute créée:', {
                    disputeId: dispute.id,
                    amount: dispute.amount,
                    reason: dispute.reason,
                    paymentIntent: dispute.payment_intent
                });

                // TODO: Marquer le ticket comme contesté dans votre base de données
                break;

            case 'charge.refunded':
                const refund = stripeEvent.data.object;
                console.log('Remboursement effectué:', {
                    chargeId: refund.id,
                    amount: refund.amount_refunded,
                    paymentIntent: refund.payment_intent
                });

                // TODO: Marquer le ticket comme remboursé dans votre base de données
                break;

            default:
                console.log(`Événement non géré: ${stripeEvent.type}`);
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ received: true })
        };
    } catch (err) {
        console.error('Erreur de traitement webhook:', err);
        return {
            statusCode: 500,
            body: `Erreur de traitement webhook: ${err.message}`
        };
    }
}; 