const { createClient } = require('@supabase/supabase-js');

// Initialisation du client Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

exports.handler = async (event) => {
    console.log('🎫 Fonction getEvent appelée');

    // Vérifier la méthode HTTP
    if (event.httpMethod !== 'GET') {
        console.log('❌ Méthode HTTP non autorisée:', event.httpMethod);
        return {
            statusCode: 405,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'GET, OPTIONS'
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
                'Access-Control-Allow-Methods': 'GET, OPTIONS'
            },
            body: ''
        };
    }

    try {
        // Récupérer l'ID de l'événement depuis les paramètres de requête
        const eventId = event.queryStringParameters?.id;

        if (!eventId) {
            console.log('❌ ID d\'événement manquant');
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Access-Control-Allow-Methods': 'GET, OPTIONS'
                },
                body: JSON.stringify({ error: 'ID d\'événement requis' })
            };
        }

        console.log('📝 ID d\'événement reçu:', eventId);

        console.log('🔄 Récupération de l\'événement depuis Supabase...');

        // Récupérer l'événement avec les informations de l'association
        const { data: eventData, error: eventError } = await supabase
            .from('events')
            .select(`
                id,
                name,
                description,
                date,
                location,
                price,
                image_url,
                platform_fee,
                available_tickets,
                association_id,
                event_ticket_types (*),
                associations (
                    id,
                    name,
                    profile_image_url,
                    cover_image_url
                )
            `)
            .eq('id', eventId)
            .single();

        if (eventError) {
            console.error('❌ Erreur lors de la récupération de l\'événement:', eventError);
            return {
                statusCode: 404,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Access-Control-Allow-Methods': 'GET, OPTIONS'
                },
                body: JSON.stringify({ 
                    error: 'Événement non trouvé',
                    details: eventError.message
                })
            };
        }

        if (!eventData) {
            console.log('❌ Aucun événement trouvé avec l\'ID:', eventId);
            return {
                statusCode: 404,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Access-Control-Allow-Methods': 'GET, OPTIONS'
                },
                body: JSON.stringify({ error: 'Événement non trouvé' })
            };
        }

        // Vérifier si l'événement est dans le futur
        const eventDate = new Date(eventData.date);
        const now = new Date();
        
        if (eventDate <= now) {
            console.log('❌ L\'événement a déjà eu lieu');
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Access-Control-Allow-Methods': 'GET, OPTIONS'
                },
                body: JSON.stringify({ error: 'Cet événement a déjà eu lieu' })
            };
        }

        // Vérifier la capacité si applicable
        if (eventData.available_tickets !== null && eventData.available_tickets <= 0) {
            console.log('❌ L\'événement est complet');
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Access-Control-Allow-Methods': 'GET, OPTIONS'
                },
                body: JSON.stringify({ error: 'Cet événement est complet' })
            };
        }

        console.log('✅ Événement récupéré:', eventData.name);

        // Transformer les données pour le frontend
        const ticketTypes = Array.isArray(eventData.event_ticket_types)
            ? eventData.event_ticket_types.map((ticketType) => {
                const parseNullableNumber = (value) => {
                    if (value === null || value === undefined) {
                        return null;
                    }
                    const parsed = Number(value);
                    return Number.isFinite(parsed) ? parsed : null;
                };

                const parseNullableInt = (value) => {
                    if (value === null || value === undefined) {
                        return null;
                    }
                    const parsed = parseInt(value, 10);
                    return Number.isFinite(parsed) ? parsed : null;
                };

                const remainingFields = [
                    ticketType.remaining_quantity,
                    ticketType.quantity_remaining,
                    ticketType.available_quantity,
                    ticketType.stock_remaining,
                    ticketType.stock,
                    ticketType.remaining,
                    ticketType.quantity
                ];

                let remainingQuantity = null;
                for (const field of remainingFields) {
                    const parsed = parseNullableInt(field);
                    if (parsed !== null) {
                        remainingQuantity = parsed;
                        break;
                    }
                }

                return {
                    id: ticketType.id,
                    name: ticketType.name,
                    description: ticketType.description,
                    price: parseNullableNumber(ticketType.price) ?? 0,
                    quantity_limit: parseNullableInt(ticketType.quantity_limit),
                    remaining_quantity: remainingQuantity
                };
            }).filter((ticketType) => Boolean(ticketType.id))
            : [];

        const formattedEvent = {
            id: eventData.id,
            name: eventData.name,
            description: eventData.description,
            date: eventData.date,
            location: eventData.location,
            price: eventData.price,
            image_url: eventData.image_url,
            platform_fee_percentage: eventData.platform_fee || 5,
            association_id: eventData.association_id,
            association_name: eventData.associations?.name || 'Association',
            association_logo: eventData.associations?.profile_image_url || eventData.associations?.cover_image_url,
            available_tickets: eventData.available_tickets,
            ticket_types: ticketTypes
        };

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                event: formattedEvent
            })
        };

    } catch (error) {
        console.error('❌ Erreur inattendue:', error);
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'GET, OPTIONS'
            },
            body: JSON.stringify({ 
                error: 'Erreur interne du serveur',
                details: error.message
            })
        };
    }
};
