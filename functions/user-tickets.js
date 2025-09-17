const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
    // Configuration CORS
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
    };

    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        // Initialiser Supabase
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

        if (!supabaseUrl || !supabaseServiceKey) {
            console.error('❌ Variables d\'environnement Supabase manquantes');
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'Configuration serveur manquante' })
            };
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Récupérer le token depuis les headers
        const authHeader = event.headers.authorization || event.headers.Authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({ 
                    error: 'Token d\'authentification manquant' 
                })
            };
        }

        const token = authHeader.replace('Bearer ', '');

        console.log('🎫 Récupération des tickets utilisateur...');

        // Vérifier le token et récupérer l'utilisateur
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);

        if (authError || !user) {
            console.log('❌ Token invalide:', authError?.message);
            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({ 
                    error: 'Token invalide' 
                })
            };
        }

        console.log('✅ Token valide pour:', user.id);

        // Récupérer les tickets de l'utilisateur avec les détails de l'événement
        const { data: tickets, error: ticketsError } = await supabase
            .from('tickets')
            .select(`
                *,
                events (
                    id,
                    name,
                    date,
                    location,
                    price,
                    cover_image_url
                )
            `)
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (ticketsError) {
            console.error('❌ Erreur récupération tickets:', ticketsError);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ 
                    error: 'Erreur lors de la récupération des tickets' 
                })
            };
        }

        console.log(`✅ ${tickets.length} tickets trouvés pour l'utilisateur`);

        // Formater les données des tickets
        const formattedTickets = tickets.map(ticket => ({
            id: ticket.id,
            ticket_code: ticket.ticket_code,
            is_used: ticket.is_used,
            price_paid: ticket.price_paid,
            created_at: ticket.created_at,
            event_id: ticket.event_id,
            event_name: ticket.events?.name || 'Événement supprimé',
            event_date: ticket.events?.date,
            event_location: ticket.events?.location,
            event_price: ticket.events?.price,
            event_image: ticket.events?.cover_image_url
        }));

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(formattedTickets)
        };

    } catch (error) {
        console.error('❌ Erreur serveur user-tickets:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                error: 'Erreur interne du serveur' 
            })
        };
    }
};
