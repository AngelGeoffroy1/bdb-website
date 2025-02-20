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
                    // Créer le ticket dans la base de données
                    const ticketData = {
                        event_id: metadata.event_id,
                        quantity: parseInt(metadata.quantity),
                        total_amount: paymentIntent.amount / 100, // Convertir les centimes en euros
                        customer_name: metadata.customer_name,
                        customer_email: metadata.customer_email,
                        payment_id: paymentIntent.id,
                        payment_status: 'completed',
                        created_at: new Date().toISOString()
                    };

                    // TODO: Ajouter ici l'appel à votre base de données pour sauvegarder le ticket
                    console.log('Ticket à créer:', ticketData);

                    // Envoyer un email de confirmation
                    // TODO: Implémenter l'envoi d'email
                    console.log('Email de confirmation à envoyer à:', metadata.customer_email);

                } catch (error) {
                    console.error('Erreur lors de la création du ticket:', error);
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
                    // Mettre à jour le statut de la réservation
                    const eventId = failedPayment.metadata.event_id;
                    const quantity = parseInt(failedPayment.metadata.quantity);

                    // TODO: Mettre à jour votre base de données pour libérer les places
                    console.log('Places à libérer:', {
                        eventId,
                        quantity
                    });

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