const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
    // Gestion des CORS
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Access-Control-Allow-Methods': 'GET, OPTIONS'
            },
            body: ''
        };
    }

    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ success: false, error: 'Méthode non autorisée' })
        };
    }

    try {
        // Vérifier les variables d'environnement Supabase
        if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
            console.error('Variables d\'environnement Supabase manquantes');
            return {
                statusCode: 500,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    success: false, 
                    error: 'Configuration serveur manquante' 
                })
            };
        }

        // Récupérer le token d'authentification depuis les headers
        const authHeader = event.headers.Authorization || event.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return {
                statusCode: 401,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    success: false, 
                    error: 'Token d\'authentification manquant' 
                })
            };
        }

        const token = authHeader.replace('Bearer ', '');

        // Initialiser le client Supabase
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_KEY
        );

        // Vérifier et récupérer les informations de l'utilisateur depuis le token
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);

        if (authError || !user) {
            console.error('Token invalide ou utilisateur non trouvé:', authError?.message);
            return {
                statusCode: 401,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    success: false, 
                    error: 'Token d\'authentification invalide' 
                })
            };
        }

        console.log(`🎫 Récupération des billets pour: ${user.email}`);

        // Récupérer les billets de l'utilisateur avec les informations de l'événement
        const { data: tickets, error: ticketsError } = await supabase
            .from('tickets')
            .select(`
                *,
                events (
                    id,
                    name,
                    date,
                    location,
                    description
                )
            `)
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (ticketsError) {
            console.error('Erreur lors de la récupération des billets:', ticketsError);
            return {
                statusCode: 500,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    success: false, 
                    error: 'Erreur lors de la récupération des billets' 
                })
            };
        }

        // Formater les données des billets
        const formattedTickets = tickets.map(ticket => ({
            id: ticket.id,
            ticket_code: ticket.ticket_code,
            event_id: ticket.event_id,
            event_name: ticket.events?.name || 'Événement supprimé',
            event_date: ticket.events?.date,
            event_location: ticket.events?.location,
            event_description: ticket.events?.description,
            is_used: ticket.is_used || false,
            used_at: ticket.used_at,
            created_at: ticket.created_at,
            updated_at: ticket.updated_at
        }));

        console.log(`✅ ${formattedTickets.length} billets récupérés pour: ${user.email}`);

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                tickets: formattedTickets,
                count: formattedTickets.length
            })
        };

    } catch (error) {
        console.error('Erreur serveur lors de la récupération des billets:', error);
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                success: false, 
                error: 'Erreur serveur interne' 
            })
        };
    }
};
