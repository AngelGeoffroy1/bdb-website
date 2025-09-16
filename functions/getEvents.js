const { createClient } = require('@supabase/supabase-js');

// Initialisation du client Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

exports.handler = async (event) => {
    console.log('🎫 Fonction getEvents appelée');

    // Vérifier la méthode HTTP
    if (event.httpMethod !== 'GET') {
        console.log('❌ Méthode HTTP non autorisée:', event.httpMethod);
        return {
            statusCode: 405,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
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
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
            },
            body: ''
        };
    }

    try {
        console.log('🔄 Récupération des événements depuis Supabase...');

        // Récupérer tous les événements avec les informations de l'association
        const { data: events, error: eventsError } = await supabase
            .from('events')
            .select(`
                id,
                name,
                description,
                date,
                location,
                address,
                price,
                image_url,
                platform_fee,
                association_id,
                available_tickets,
                associations (
                    id,
                    name,
                    profile_image_url,
                    cover_image_url
                )
            `)
            .order('date', { ascending: false }); // Plus récents en premier

        if (eventsError) {
            console.error('❌ Erreur lors de la récupération des événements:', eventsError);
            return {
                statusCode: 500,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
                },
                body: JSON.stringify({ 
                    error: 'Erreur lors de la récupération des événements',
                    details: eventsError.message
                })
            };
        }

        console.log(`✅ ${events.length} événements récupérés`);

        // Séparer les événements futurs et passés
        const now = new Date();
        const futureEvents = [];
        const pastEvents = [];

        events.forEach(event => {
            const eventDate = new Date(event.date);
            const formattedEvent = {
                id: event.id,
                name: event.name,
                description: event.description,
                date: event.date,
                location: event.location,
                address: event.address,
                price: event.price,
                image_url: event.image_url,
                platform_fee_percentage: event.platform_fee || 5,
                association_id: event.association_id,
                association_name: event.associations?.name || 'Association',
                association_logo: event.associations?.profile_image_url || event.associations?.cover_image_url,
                available_tickets: event.available_tickets
            };

            if (eventDate > now) {
                futureEvents.push(formattedEvent);
            } else {
                pastEvents.push(formattedEvent);
            }
        });

        // Trier les événements futurs par date croissante et les passés par date décroissante
        futureEvents.sort((a, b) => new Date(a.date) - new Date(b.date));
        pastEvents.sort((a, b) => new Date(b.date) - new Date(a.date));

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                futureEvents: futureEvents,
                pastEvents: pastEvents,
                futureCount: futureEvents.length,
                pastCount: pastEvents.length,
                totalCount: events.length
            })
        };

    } catch (error) {
        console.error('❌ Erreur inattendue:', error);
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
            },
            body: JSON.stringify({ 
                error: 'Erreur interne du serveur',
                details: error.message
            })
        };
    }
};
