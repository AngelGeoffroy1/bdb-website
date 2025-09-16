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

        // Récupérer les événements actifs avec les informations de l'association
        const { data: events, error: eventsError } = await supabase
            .from('events')
            .select(`
                id,
                name,
                description,
                date,
                location,
                price,
                image_url,
                category,
                platform_fee_percentage,
                association_id,
                associations (
                    id,
                    name,
                    logo_url
                )
            `)
            .eq('is_active', true)
            .gte('date', new Date().toISOString()) // Seulement les événements futurs
            .order('date', { ascending: true });

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

        // Transformer les données pour le frontend
        const formattedEvents = events.map(event => ({
            id: event.id,
            name: event.name,
            description: event.description,
            date: event.date,
            location: event.location,
            price: event.price,
            image_url: event.image_url,
            category: event.category || 'soiree',
            platform_fee_percentage: event.platform_fee_percentage || 5,
            association_id: event.association_id,
            association_name: event.associations?.name || 'Association',
            association_logo: event.associations?.logo_url
        }));

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
                events: formattedEvents,
                count: formattedEvents.length
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
